// contracts/Reedemable.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@manifoldxyz/royalty-registry-solidity/contracts/overrides/RoyaltyOverrideCore.sol";
import "@manifoldxyz/libraries-solidity/contracts/access/AdminControl.sol";

// Implements a contract to redeem (mint) a token.
//
// Features:
//
// - Users can redeem (mint) their tokens through this contract.
// - Admin can set a price (default 0) for the users to pay when redeeming.
// - Admin can set a reference contract where the user needs to own tokenId.
//   This is useful to enable redemption for users that own a token from another collection (smart contract address).
//   In this case the tokenId must match the other collection tokenId.

contract Reedemable is
  AdminControl,
  ERC721,
  EIP2981RoyaltyOverrideCore
  // ERC721Burnable,
{
  bool private _paused = false;

  function setPaused(bool paused) external adminRequired {
    _paused = paused;
  }

  bool private _frozen = false;

  function freeze() external adminRequired {
    _frozen = true;
  }

  // The token metadata baseURI. Upon minting the tokenId is concatenated to the baseURI.
  // eg. https://ipfs.io/abc/ -> https://ipfs.io/abc/1
  string private _baseTokenURI = "";

  function setBaseURI(string calldata baseURI) external adminRequired {
    require(!_frozen, "Frozen");
    _baseTokenURI = baseURI;
  }

  function _baseURI() internal view override returns (string memory) {
    return _baseTokenURI;
  }

  // The token price: 0 ETH;
  uint256 private _price = 0;

  function setPrice(uint256 price) external adminRequired {
    _price = price;
  }

  function price() external view returns (uint256) {
    return _price;
  }

  // type TokenRoyalty = { recipient: address; bps: }
  function setDefaultRoyalty(TokenRoyalty calldata royalty) external override adminRequired {
    _setDefaultRoyalty(royalty);
  }

  function setTokenRoyalties(TokenRoyaltyConfig[] calldata royaltyConfigs) external override adminRequired {
    _setTokenRoyalties(royaltyConfigs);
  }

  address private _ownedTokenContractAddress = address(0);

  function setOwnedTokenContractAddress(address contractAddress) external adminRequired {
    _ownedTokenContractAddress = contractAddress;
  }

  function supportsInterface(bytes4 interfaceId)
    public
    view
    virtual
    override(AdminControl, ERC721, EIP2981RoyaltyOverrideCore)
    returns (bool)
  {
    return AdminControl.supportsInterface(interfaceId) || ERC721.supportsInterface(interfaceId) || EIP2981RoyaltyOverrideCore.supportsInterface(interfaceId) || super.supportsInterface(interfaceId);
  }

  constructor(
    string memory name,
    string memory symbol,
    string memory baseTokenURI,
    uint256 price,
    address ownedTokenContractAddress
  ) ERC721(name, symbol) {
    _baseTokenURI = baseTokenURI;
    _price = price;
    _ownedTokenContractAddress = ownedTokenContractAddress;
    // 10% royalty
    _setDefaultRoyalty(TokenRoyalty(address(this), 1000));
    _safeMint(owner(), 0);
  }

  function redeem(uint256 tokenId) external payable returns (uint256) {
    require(!_paused, "Reedem not enabled right now. Try later");
    require(!_frozen, "It is no longer possible to redeem");
    require(_canRedeem(tokenId), "Not allowed to redeem");

    // Paywall check. 0 === free
    require(_price == 0 || msg.value >= _price, "Invalid Ether amount");

    _safeMint(_msgSender(), tokenId);
    return tokenId;
  }

  function _canRedeem(uint256 tokenId) internal view returns (bool) {
    return (
      isAdmin(_msgSender()) ||
      _ownedTokenContractAddress == address(0) ||
      ERC721(_ownedTokenContractAddress).ownerOf(tokenId) == _msgSender()
    );
  }

  // Admin can mint (redeem to) without limits and for free.
  function mint(address[] calldata recipients, uint256[] calldata tokenIds) external adminRequired {
    require(recipients.length == tokenIds.length, "You should provide an equal amount of recipients and token ids");
    for (uint i = 0; i < recipients.length; i++) {
      _safeMint(recipients[i], tokenIds[i]);
    }
  }

  function withdraw(address recipientAddress) external adminRequired {
    payable(recipientAddress).transfer(address(this).balance);
  }
}
