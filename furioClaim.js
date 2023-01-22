/*
- FUR Compound - 
This strategy involves triggering the compound function on the Furio vault contract every 24 hours in order to continue receiving the maximum payout rewards from the ROI dapp. A notification email report is then sent via email to update the status of the wallets. This compound bot supports multiple wallets and just loops through all of them. Just change the 'initWallets' code to the number you like!  

URL: https://app.furio.io/?ref=0xFdD831b51DCdA2be256Edf12Cd81C6Af79b6D7Df
*/

// Import required node modules
const scheduler = require("node-schedule");
const nodemailer = require("nodemailer");
const fetch = require("cross-fetch");
const { ethers } = require("ethers");
const figlet = require("figlet");
require("dotenv").config();
const fs = require("fs");

// ABI for the furio vault contract
const ABI = [
  "function claimRewards() external",
  "function compound() external returns (bool)",
  "function claimToFurpool(uint256) external returns (bool)",
  "function participantBalance(address) external view returns (uint256)",
  "function stakingAmountInUsdc(address) external view returns (uint256)",
  "function getRemainingLockedTime(address) public view returns (uint256)",
];

// Import the environment variables
const VAULT = process.env.CONTRACT_ADR;
const RPC_URL = process.env.BSC_RPC;
const POOL = process.env.POOL_ADR;

// Storage obj
var restakes = {
  previousRestake: "",
  nextRestake: "",
};
var report = {};

// Main Function
const main = async () => {
  let restakeExists = false;
  try {
    // check if restake file exists
    if (!fs.existsSync("./restakes.json")) await storedData();

    // get stored values from file
    const storedData = JSON.parse(fs.readFileSync("./restakes.json"));

    // not first launch, check data
    if ("nextRestake" in storedData) {
      const nextRestake = new Date(storedData.nextRestake);

      // restore claims schedule
      if (nextRestake > new Date()) {
        console.log("Restored Restake: " + nextRestake);
        scheduler.scheduleJob(nextRestake, FURCompound);
        restakeExists = true;
      }
    }
  } catch (error) {
    console.error(error);
  }

  // first time, no previous launch
  if (!restakeExists) FURCompound();
};

// Import wallet detail
const initWallets = (n) => {
  let wallets = [];
  for (let i = 1; i <= n; i++) {
    const wallet = {
      address: process.env["ADR_" + i],
      key: process.env["PVK_" + i],
      index: i,
    };
    wallets.push(wallet);
  }
  return wallets;
};

// Ethers connect on each wallet
const connect = async (wallet) => {
  let connection = {};

  // Add connection properties
  connection.provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  connection.wallet = new ethers.Wallet(wallet.key, connection.provider);
  connection.furpool = new ethers.Contract(POOL, ABI, connection.wallet);
  connection.contract = new ethers.Contract(VAULT, ABI, connection.wallet);

  // connection established
  await connection.provider.getBalance(wallet.address);
  return connection;
};

// FUR Compound Function
const FURCompound = async () => {
  // start function
  console.log("\n");
  console.log(
    figlet.textSync("FurioCompound", {
      font: "Standard",
      horizontalLayout: "default",
      verticalLayout: "default",
      width: 80,
      whitespaceBreak: true,
    })
  );

  // get wallet detail from .env
  const wallets = initWallets(5);

  // storage attributes for sending reports
  report.title = "Furio Report " + todayDate();
  report.actions = [];
  report.furPool = [];
  let balances = [];
  let promises = [];

  // store last compound, schedule next
  restakes.previousRestake = new Date().toString();
  const date = new Date();
  const d = date.getDay();
  scheduleNext(date);

  // Sun, Mon & Tue only
  const claimDay = d < 3;

  // loop through for each wallet
  for (const wallet of wallets) {
    if (claimDay) {
      const action = claim(wallet);
      report.mode = "claim";
      promises.push(action);
    } else {
      const action = compound(wallet);
      report.mode = "compound";
      promises.push(action);
    }
  }

  // wait for the action promises to finish resolving
  const results = await Promise.allSettled(promises);
  for (const result of results) {
    try {
      const action = result.value;
      report.actions.push(action);
      if (action.balance) {
        balances.push(parseFloat(action.balance));
      }
    } catch (error) {
      console.error(error);
    }
  }
  promises = [];

  // execute the Pools afterwards
  for (const wallet of wallets) {
    const pool = furPool(wallet);
    promises.push(pool);
  }

  // wait for the Pools promises to finish resolving
  const settles = await Promise.allSettled(promises);
  for (const result of settles) {
    try {
      const pool = result.value;
      report.furPool.push(pool);
    } catch (error) {
      console.error(error);
    }
  }

  // calculate the average wallet size
  const average = eval(balances.join("+")) / balances.length;
  report.consolidated = { average: average, target: "11111 FUR" };

  // report status daily
  report.schedule = restakes;
  sendReport();
};

// Claim Individual Wallet
const claim = async (wallet, tries = 1.0) => {
  const w = wallet.address.slice(0, 5) + "..." + wallet.address.slice(-6);
  try {
    // connection using the current wallet
    const connection = await connect(wallet);
    const nonce = await connection.provider.getTransactionCount(wallet.address);

    // set custom gasPrice
    const overrideOptions = {
      nonce: nonce,
      gasLimit: 999999,
      gasPrice: ethers.utils.parseUnits(tries.toString(), "gwei"),
    };
    const m = Math.floor((120 * 60000) / tries);

    // call the claimToFurpool function and await the results
    const result = await connection.contract.claimToFurpool(1, overrideOptions);
    const receipt = await connection.provider.waitForTransaction(
      result.hash,
      1,
      m
    );

    // get the total balance currently locked in the vault
    const b = await connection.contract.participantBalance(wallet.address);
    const balance = ethers.utils.formatEther(b);

    // succeeded
    if (receipt) {
      const b = await connection.provider.getBalance(wallet.address);
      console.log(`Wallet${wallet["index"]}: success`);
      console.log(`Vault Balance: ${balance} FUR`);
      const bal = ethers.utils.formatEther(b);

      const success = {
        index: wallet.index,
        wallet: w,
        BNB: bal,
        balance: balance,
        claimToPool: true,
        tries: tries,
      };

      return success;
    }
  } catch (error) {
    console.log(`Wallet${wallet["index"]}: failed!`);
    console.error(error);

    // max 5 tries
    if (tries > 5) {
      // failed
      const failure = {
        index: wallet.index,
        wallet: w,
        claimToPool: false,
      };

      return failure;
    }

    // failed, retrying again...
    console.log(`retrying(${tries})...`);
    return await claim(wallet, ++tries);
  }
};

// Compound Individual Wallet
const compound = async (wallet, tries = 1.0) => {
  try {
    // connection using the current wallet
    const connection = await connect(wallet);
    const mask = wallet.address.slice(0, 5) + "..." + wallet.address.slice(-6);
    const nonce = await connection.provider.getTransactionCount(wallet.address);

    // set custom gasPrice
    const overrideOptions = {
      nonce: nonce,
      gasLimit: 999999,
      gasPrice: ethers.utils.parseUnits(tries.toString(), "gwei"),
    };
    const m = Math.floor((120 * 60000) / tries);

    // call the compound function and await the results
    const result = await connection.contract.compound(overrideOptions);
    const receipt = await connection.provider.waitForTransaction(
      result.hash,
      1,
      m
    );

    // get the total balance currently locked in the vault
    const b = await connection.contract.participantBalance(wallet.address);
    const balance = ethers.utils.formatEther(b);

    // succeeded
    if (receipt) {
      const b = await connection.provider.getBalance(wallet.address);
      console.log(`Wallet${wallet["index"]}: success`);
      console.log(`Vault Balance: ${balance} FUR`);
      const bal = ethers.utils.formatEther(b);

      const success = {
        index: wallet.index,
        wallet: mask,
        BNB: bal,
        balance: balance,
        compound: true,
        tries: tries,
      };

      return success;
    }
  } catch (error) {
    console.log(`Wallet${wallet["index"]}: failed!`);
    console.error(error);

    // max 5 tries
    if (tries > 5) {
      // failed
      const w = wallet.address.slice(0, 5) + "..." + wallet.address.slice(-6);
      const failure = {
        index: wallet.index,
        wallet: w,
        compound: false,
      };

      return failure;
    }

    // failed, retrying again...
    console.log(`retrying(${tries})...`);
    return await compound(wallet, ++tries);
  }
};

// Furpool Compound Function
const furPool = async (wallet, tries = 1.0) => {
  const w = wallet.address.slice(0, 5) + "..." + wallet.address.slice(-6);
  try {
    // connection using the current wallet
    const connection = await connect(wallet);
    const nonce = await connection.provider.getTransactionCount(wallet.address);

    // set custom gasPrice
    const overrideOptions = {
      nonce: nonce,
      gasLimit: 999999,
      gasPrice: ethers.utils.parseUnits(tries.toString(), "gwei"),
    };
    const m = Math.floor((60 * 60000) / tries);

    // call the compound function and await the results
    const result = await connection.furpool.claimRewards(overrideOptions);
    const receipt = await connection.provider.waitForTransaction(
      result.hash,
      1,
      m
    );

    // get the total balance and duration locked in the vault
    const t = await connection.furpool.getRemainingLockedTime(wallet.address);
    const b = await connection.furpool.stakingAmountInUsdc(wallet.address);
    const time = Math.ceil(Number(t) / (3600 * 24));
    const balance = ethers.utils.formatEther(b);

    // succeeded
    if (receipt) {
      console.log(`Furpool: success`);
      console.log(`Balance: ${balance} USDC`);

      const success = {
        index: wallet.index,
        type: "Furpool",
        wallet: w,
        balance: balance,
        locked: `${time} days`,
        claim: true,
        tries: tries,
      };

      return success;
    }
  } catch (error) {
    console.log(`Furpool: failed`);
    console.error(error);

    // max 5 tries
    if (tries > 5) {
      // failed
      const fail = {
        index: wallet.index,
        type: "Furpool",
        wallet: w,
        claim: false,
      };

      return fail;
    }

    // failed, retrying again...
    console.log(`retrying(${tries})...`);
    return await furPool(wallet, ++tries);
  }
};

// Job Scheduler Function
const scheduleNext = async (nextDate) => {
  // set next job to be 24hrs from now
  nextDate.setHours(nextDate.getHours() + 24);
  restakes.nextRestake = nextDate.toString();
  console.log("Next Restake: ", nextDate);

  // schedule next restake
  scheduler.scheduleJob(nextDate, FURCompound);
  storeData();
  return;
};

// Data Storage Function
const storeData = async () => {
  const data = JSON.stringify(restakes);
  fs.writeFile("./restakes.json", data, (err) => {
    if (err) {
      console.error(err);
    } else {
      console.log("Data stored:", restakes);
    }
  });
};

// Get Furio Price Function
const furioPrice = async () => {
  try {
    const url_string = process.env.PRICE_API;
    const response = await fetch(url_string);
    const price = await response.json();
    return price;
  } catch (error) {
    console.error(error);
    return null;
  }
};

// Current Date function
const todayDate = () => {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const yyyy = today.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

// Send Report Function
const sendReport = async () => {
  try {
    // get the formatted date
    const today = todayDate();
    report.title = "Furio Report " + today;

    // get price of Furio
    const price = await furioPrice();
    report.price = price;
    console.log(report);

    // configure email server
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_ADDR,
        pass: process.env.EMAIL_PW,
      },
    });

    // setup mail params
    const mailOptions = {
      from: process.env.EMAIL_ADDR,
      to: process.env.RECIPIENT,
      subject: "Furio Report: " + today,
      text: JSON.stringify(report, null, 2),
    };

    // send the email message
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error(error);
      } else {
        console.log("Email sent: " + info.response);
      }
    });

    // clear var
    report = {};
  } catch (error) {
    console.error(error);
  }
};

main();
