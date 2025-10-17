// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev ממשק מינימלי לטוקן BAL שמאפשר הטבעה (mint)
interface IBALMint {
    function mint(address to, uint256 amount) external;
}

/// @title Voting with Merkle-verified voter registry, time window, BAL reward, and questionnaire voting
/// @notice Elections contract: admin adds candidates (optionally with a 3-answer quiz),
///         voters can vote by id or by questionnaire similarity; each valid vote mints BAL.
contract Voting {
    /*//////////////////////////////////////////////////////////////
                               TYPES
    //////////////////////////////////////////////////////////////*/

    struct Candidate {
        string name;
        uint256 votes;
        uint8[3] quiz; // שלוש תשובות (למשל ערכים 0/1/2)
    }

    /*//////////////////////////////////////////////////////////////
                               STATE
    //////////////////////////////////////////////////////////////*/

    address public immutable owner;
    bytes32 public immutable votersMerkleRoot;
    uint64 public immutable startTime;
    uint64 public immutable endTime;

    Candidate[] private _candidates;
    mapping(address => bool) public hasVoted;

    // BAL reward token
    IBALMint public rewardToken;
    uint256  public rewardPerVote = 1e18; // 1 BAL (18 דצימלים)

    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    event CandidateAdded(uint256 indexed candidateId, string name);
    event Voted(address indexed voter, uint256 indexed candidateId);
    event RewardTokenUpdated(address indexed token);
    event VoteRewardMinted(address indexed voter, uint256 amount);

    /*//////////////////////////////////////////////////////////////
                              ERRORS
    //////////////////////////////////////////////////////////////*/

    error NotOwner();
    error VotingNotStarted();
    error VotingAlreadyStarted();
    error VotingClosed();
    error InvalidCandidate();
    error AlreadyVoted();
    error NotInVoterBook();
    error RewardTokenNotSet();

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(bytes32 _votersMerkleRoot, uint64 _startTime, uint64 _endTime) {
        require(_endTime >= _startTime, "bad window");
        owner = msg.sender;
        votersMerkleRoot = _votersMerkleRoot;
        startTime = _startTime;
        endTime = _endTime;
    }

    /*//////////////////////////////////////////////////////////////
                           OWNER ACTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice הוספת מועמד חדש ללא שאלון (תואם לאחור לסקריפטים קיימים)
    function addCandidate(string calldata name) external {
        if (msg.sender != owner) revert NotOwner();
        if (block.timestamp >= startTime) revert VotingAlreadyStarted();
        _candidates.push(Candidate({name: name, votes: 0, quiz: [uint8(0), uint8(0), uint8(0)]}));
        emit CandidateAdded(_candidates.length - 1, name);
    }

    /// @notice הוספת מועמד עם שלוש תשובות לשאלון
    function addCandidateWithQuiz(string calldata name, uint8[3] calldata quiz) external {
        if (msg.sender != owner) revert NotOwner();
        if (block.timestamp >= startTime) revert VotingAlreadyStarted();
        _candidates.push(Candidate({name: name, votes: 0, quiz: quiz}));
        emit CandidateAdded(_candidates.length - 1, name);
    }

    /// @notice הגדרת חוזה ה-BAL
    function setRewardToken(address token) external {
        if (msg.sender != owner) revert NotOwner();
        require(token != address(0), "zero token");
        rewardToken = IBALMint(token);
        emit RewardTokenUpdated(token);
    }

    /// @notice עדכון סכום תגמול לכל קול
    function setRewardPerVote(uint256 amount) external {
        if (msg.sender != owner) revert NotOwner();
        rewardPerVote = amount;
    }

    /*//////////////////////////////////////////////////////////////
                               VOTING
    //////////////////////////////////////////////////////////////*/

    /// @notice הצבעה ישירה לפי מזהה מועמד
    function vote(uint256 candidateId, bytes32[] calldata merkleProof) external {
        _performVote(candidateId, merkleProof);
    }

    /// @notice הצבעה לפי שאלון: בוחר את המועמד עם מירב ההתאמות (tie-breaker: מזהה קטן יותר)
    function voteByQuestionnaire(uint8[3] calldata answers, bytes32[] calldata merkleProof) external {
        uint256 bestId = _bestMatchCandidate(answers);
        _performVote(bestId, merkleProof);
    }

    function _performVote(uint256 candidateId, bytes32[] calldata merkleProof) internal {
        if (block.timestamp < startTime) revert VotingNotStarted();
        if (block.timestamp > endTime) revert VotingClosed();
        if (candidateId >= _candidates.length) revert InvalidCandidate();
        if (hasVoted[msg.sender]) revert AlreadyVoted();

        // אימות מרקל: leaf = keccak256(abi.encodePacked(msg.sender))
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender));
        if (!_verifyMerkle(merkleProof, votersMerkleRoot, leaf)) revert NotInVoterBook();

        _candidates[candidateId].votes += 1;
        hasVoted[msg.sender] = true;
        emit Voted(msg.sender, candidateId);

        if (address(rewardToken) == address(0)) revert RewardTokenNotSet();
        rewardToken.mint(msg.sender, rewardPerVote);
        emit VoteRewardMinted(msg.sender, rewardPerVote);
    }

    function _bestMatchCandidate(uint8[3] calldata answers) internal view returns (uint256 bestId) {
        uint256 n = _candidates.length;
        if (n == 0) revert InvalidCandidate();
        uint256 bestScore = 0;

        for (uint256 i = 0; i < n; i++) {
            uint8[3] memory q = _candidates[i].quiz;
            uint256 score = 0;
            if (q[0] == answers[0]) score++;
            if (q[1] == answers[1]) score++;
            if (q[2] == answers[2]) score++;
            if (score > bestScore) {
                bestScore = score;
                bestId = i;
            }
            // אם יש תיקו, נשארים עם ה-id הקטן יותר (הראשון שמצאנו)
        }
        return bestId;
    }

    /*//////////////////////////////////////////////////////////////
                               VIEWS
    //////////////////////////////////////////////////////////////*/

    function getResults() external view returns (Candidate[] memory out) {
        uint256 n = _candidates.length;
        out = new Candidate[](n);
        for (uint256 i = 0; i < n; i++) {
            out[i] = _candidates[i];
        }
    }

    function candidatesCount() external view returns (uint256) {
        return _candidates.length;
    }

    /// @notice שמירת תאימות: החזרה כמו פעם (שם+קולות)
    function getCandidate(uint256 candidateId) external view returns (string memory name, uint256 votes) {
        if (candidateId >= _candidates.length) revert InvalidCandidate();
        Candidate storage c = _candidates[candidateId];
        return (c.name, c.votes);
    }

    /// @notice גטר מורחב: שם+קולות+שאלון
    function getCandidateWithQuiz(uint256 candidateId) external view returns (string memory name, uint256 votes, uint8[3] memory quiz) {
        if (candidateId >= _candidates.length) revert InvalidCandidate();
        Candidate storage c = _candidates[candidateId];
        return (c.name, c.votes, c.quiz);
    }

    /*//////////////////////////////////////////////////////////////
                           MERKLE PROOF (LOCAL)
    //////////////////////////////////////////////////////////////*/

    function _verifyMerkle(bytes32[] calldata proof, bytes32 root, bytes32 leaf) internal pure returns (bool) {
        bytes32 computed = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 sibling = proof[i];
            if (computed <= sibling) {
                computed = keccak256(abi.encodePacked(computed, sibling));
            } else {
                computed = keccak256(abi.encodePacked(sibling, computed));
            }
        }
        return computed == root;
    }
}

