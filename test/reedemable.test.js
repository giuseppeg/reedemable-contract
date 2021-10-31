const Reedemable = artifacts.require("Reedemable");

const {
  BN,
  constants,
  expectEvent,
  expectRevert,
} = require("@openzeppelin/test-helpers");

const { ZERO_ADDRESS } = constants;

const contractName = "TestContract";
const contractSymbol = "TC";
const baseTokenURI = "https://acme.com/";

contract("Reedemable", (accounts) => {
  const [deployer, otherAddress, anotherAddress, ...restAddresses] = accounts;

  it("should create a contract correctly", async () => {
    const price = web3.utils.toWei("1", "ether");
    const instance = await Reedemable.new(
      contractName,
      contractSymbol,
      baseTokenURI,
      price,
      ZERO_ADDRESS
    );

    assert.equal(await instance.name(), contractName);
    assert.equal(await instance.symbol(), contractSymbol);
    assert.equal(await instance.price(), price);
  });

  it("can add admins", async () => {
    const price = web3.utils.toWei("1", "ether");
    const instance = await Reedemable.new(
      contractName,
      contractSymbol,
      baseTokenURI,
      price,
      ZERO_ADDRESS
    );

    assert.isTrue(await instance.isAdmin(deployer));
    assert.isFalse(await instance.isAdmin(otherAddress));

    await expectRevert(
      instance.approveAdmin(otherAddress, {
        from: otherAddress,
      }),
      "Ownable: caller is not the owner"
    );

    await instance.approveAdmin(otherAddress);
    assert.isTrue(await instance.isAdmin(otherAddress));
  });

  it("admins can mint", async () => {
    const price = web3.utils.toWei("1", "ether");
    const instance = await Reedemable.new(
      contractName,
      contractSymbol,
      baseTokenURI,
      price,
      ZERO_ADDRESS
    );

    const tokenId = "123";
    const receipt = await instance.mint([otherAddress], [tokenId]);
    await expectEvent(receipt, "Transfer", {
      from: ZERO_ADDRESS,
      to: otherAddress,
      tokenId,
    });

    assert.equal(await instance.ownerOf(tokenId), otherAddress);
    assert.equal(await instance.tokenURI(tokenId), `${baseTokenURI}${tokenId}`);
  });

  it("users can redeem any token when ownedTokenContractAddress is ZERO_ADDRESS", async () => {
    const price = web3.utils.toWei("0", "ether");
    const instance = await Reedemable.new(
      contractName,
      contractSymbol,
      baseTokenURI,
      price,
      ZERO_ADDRESS
    );

    const tokenId = "123";
    const receipt = await instance.redeem(tokenId, { from: otherAddress });
    await expectEvent(receipt, "Transfer", {
      from: ZERO_ADDRESS,
      to: otherAddress,
      tokenId,
    });

    assert.equal(await instance.ownerOf(tokenId), otherAddress);
    assert.equal(await instance.tokenURI(tokenId), `${baseTokenURI}${tokenId}`);
  });

  it("cannot redeem if paused", async () => {
    const price = web3.utils.toWei("0", "ether");
    const instance = await Reedemable.new(
      contractName,
      contractSymbol,
      baseTokenURI,
      price,
      ZERO_ADDRESS
    );

    await instance.setPaused(true);

    const tokenId = "123";
    await expectRevert(
      instance.redeem(tokenId, {
        from: otherAddress,
      }),
      "Reedem not enabled right now. Try later"
    );
  });

  it("users can redeem any token when price is 0", async () => {
    const price = web3.utils.toWei("0", "ether");
    const instance = await Reedemable.new(
      contractName,
      contractSymbol,
      baseTokenURI,
      price,
      ZERO_ADDRESS
    );

    const tokenId = "123";
    const receipt = await instance.redeem(tokenId, { from: otherAddress });
    await expectEvent(receipt, "Transfer", {
      from: ZERO_ADDRESS,
      to: otherAddress,
      tokenId,
    });

    assert.equal(await instance.ownerOf(tokenId), otherAddress);
    assert.equal(await instance.tokenURI(tokenId), `${baseTokenURI}${tokenId}`);
  });

  it("users can redeem any token when price matches or is higher", async () => {
    const price = web3.utils.toWei("1", "ether");
    const instance = await Reedemable.new(
      contractName,
      contractSymbol,
      baseTokenURI,
      price,
      ZERO_ADDRESS
    );

    const tokenId = "123";

    // Invalid: sending 0.9ETH instead of 1ETH (min required)
    await expectRevert(
      instance.redeem(tokenId, {
        from: otherAddress,
        value: web3.utils.toWei("0.9", "ether"),
      }),
      "Invalid Ether amount"
    );

    // Valid: sending 1.2ETH (minimum is 1)
    const receipt = await instance.redeem(tokenId, {
      from: otherAddress,
      value: web3.utils.toWei("1.2", "ether"),
    });

    await expectEvent(receipt, "Transfer", {
      from: ZERO_ADDRESS,
      to: otherAddress,
      tokenId,
    });

    assert.equal(await instance.ownerOf(tokenId), otherAddress);
    assert.equal(await instance.tokenURI(tokenId), `${baseTokenURI}${tokenId}`);
  });

  it("users can redeem tokens if they have token in otherAddress contract", async () => {
    const tokenId = "123";
    const price = web3.utils.toWei("0", "ether");

    const thirdPartyContract1 = await Reedemable.new(
      contractName,
      contractSymbol,
      baseTokenURI,
      price,
      ZERO_ADDRESS
    );

    await thirdPartyContract1.mint([otherAddress], [tokenId]);

    // This is the actual contract and users can redeem only if they have a token in thirdPartyContract1.address
    const instance = await Reedemable.new(
      contractName,
      contractSymbol,
      baseTokenURI,
      price,
      ZERO_ADDRESS
    );

    await instance.setOwnedTokenContractAddress(thirdPartyContract1.address);

    await expectRevert(
      instance.redeem(tokenId, {
        from: anotherAddress,
      }),
      "Not allowed to redeem"
    );

    const receipt = await instance.redeem(tokenId, {
      from: otherAddress,
    });

    await expectEvent(receipt, "Transfer", {
      from: ZERO_ADDRESS,
      to: otherAddress,
      tokenId,
    });

    assert.equal(await instance.ownerOf(tokenId), otherAddress);
  });

  it("admins can withdraw funds", async () => {
    const price = web3.utils.toWei("1", "ether");
    const instance = await Reedemable.new(
      contractName,
      contractSymbol,
      baseTokenURI,
      price,
      ZERO_ADDRESS
    );

    let tokenId = "123";

    await instance.redeem(tokenId, {
      from: otherAddress,
      value: web3.utils.toWei("1.2", "ether"),
    });

    assert.equal(
      await web3.eth.getBalance(instance.address),
      web3.utils.toWei("1.2", "ether")
    );

    tokenId = "234";
    await instance.redeem(tokenId, {
      from: otherAddress,
      value: web3.utils.toWei("3", "ether"),
    });

    assert.equal(
      await web3.eth.getBalance(instance.address),
      web3.utils.toWei("4.2", "ether")
    );

    const balanceBeforeWithdraw = await web3.eth.getBalance(deployer);

    await instance.withdraw(deployer);
    assert.equal(
      await web3.eth.getBalance(instance.address),
      web3.utils.toWei("0", "ether")
    );

    const updatedBalance = await web3.eth.getBalance(deployer);

    // TODO: figure out a better way to do this math and keep GAS fees into account
    assert.closeTo(
      Number(
        web3.utils.fromWei(
          String(updatedBalance - balanceBeforeWithdraw),
          "ether"
        )
      ),
      4.2,
      0.01
    );
  });

  it("collects royalties upon transfering", async () => {
    const price = web3.utils.toWei("1", "ether");
    const instance = await Reedemable.new(
      contractName,
      contractSymbol,
      baseTokenURI,
      price,
      ZERO_ADDRESS
    );

    let tokenId = "123";

    await instance.redeem(tokenId, {
      from: otherAddress,
      value: price,
    });

    assert.equal(await web3.eth.getBalance(instance.address), price);

    let royaltyInfo = await instance.royaltyInfo(tokenId, 100);

    assert.equal(royaltyInfo[0], instance.address);
    assert.equal(royaltyInfo[1], 10);

    const receipt = await instance.safeTransferFrom(
      otherAddress,
      anotherAddress,
      tokenId,
      {
        from: otherAddress,
      }
    );

    await expectEvent(receipt, "Transfer", {
      from: otherAddress,
      to: anotherAddress,
      tokenId,
    });

    assert.equal(await instance.ownerOf(tokenId), anotherAddress);
  });

  it("can freeze", async () => {
    const price = web3.utils.toWei("1", "ether");
    const instance = await Reedemable.new(
      contractName,
      contractSymbol,
      baseTokenURI,
      price,
      ZERO_ADDRESS
    );

    const tokenId = "123";
    await instance.mint([otherAddress], [tokenId]);

    assert.equal(await instance.tokenURI(tokenId), `${baseTokenURI}${tokenId}`);

    const finalBaseURI = "https://final.io/";
    await instance.setBaseURI(finalBaseURI);

    assert.equal(await instance.tokenURI(tokenId), `${finalBaseURI}${tokenId}`);

    await instance.freeze();

    await expectRevert(
      instance.redeem("234", {
        from: otherAddress,
      }),
      "Mint is no longer available"
    );

    await expectRevert(instance.setBaseURI(baseTokenURI), "Frozen");
  });
});
