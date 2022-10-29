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
  "function compound() external returns (bool)",
  "function participantBalance(address) external view returns (uint256)",
  "function stakingAmountInUsdc(address) external view returns (uint256)",
];

// Import the environment variables
const POOL = "0x77F50D741997DbBBb112C58dec50315E2De8Da58";
const VAULT = process.env.CONTRACT_ADR;
const RPC_URL = process.env.BSC_RPC;

// Storage obj
var restakes = {
  previousRestake: "",
  nextRestake: "",
};

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

  // storage array for sending reports
  let report = ["Furio Report " + todayDate()];
  report.push("Compound Target: 190 FUR");
  let balances = [];

  // store last compound, schedule next
  restakes.previousRestake = new Date().toString();
  scheduleNext(new Date());

  // loop through for each wallet
  for (const wallet of wallets) {
    try {
      // connection using the current wallet
      const connection = await connect(wallet);
      const mask =
        wallet.address.slice(0, 5) + "..." + wallet.address.slice(-6);

      // call the compound function and await the results
      const result = await connection.contract.compound();
      const receipt = await result.wait();

      // get the total balance currently locked in the vault
      const b = await connection.contract.participantBalance(wallet.address);
      const balance = ethers.utils.formatEther(b);

      // succeeded
      if (receipt) {
        console.log(`Wallet${wallet["index"]}: success`);
        console.log(`Vault Balance: ${balance} FUR`);

        const success = {
          index: wallet.index,
          wallet: mask,
          balance: balance,
          compound: true,
        };

        balances.push(parseFloat(balance));
        report.push(success);
      }

      // furpool compound wallet
      if (wallet["index"] === 5) {
        const pool = await furPool(wallet);
        report.push(pool);
      }
    } catch (error) {
      console.log(`Wallet${wallet["index"]}: failed!`);
      console.error(error);
      const mask =
        wallet.address.slice(0, 5) + "..." + wallet.address.slice(-6);

      // failed
      const fail = {
        index: wallet.index,
        wallet: mask,
        compound: false,
      };

      report.push(fail);
    }
  }

  // calculate the average wallet size
  const average = eval(balances.join("+")) / balances.length;
  report.push({ average: average });

  // report status daily
  report.push(restakes);
  sendReport(report);
};

// Furpool Compound Function
const furPool = async (wallet) => {
  try {
    // connection using the current wallet
    const connection = await connect(wallet);

    // call the compound function and await the results
    const result = await connection.furpool.compound();
    const receipt = await result.wait();

    // get the total balance currently locked in the vault
    const b = await connection.furpool.stakingAmountInUsdc(wallet.address);
    const balance = ethers.utils.formatEther(b);

    // succeeded
    if (receipt) {
      console.log(`Furpool: success`);
      console.log(`Balance: ${balance} USDC`);

      const success = {
        type: "Furpool",
        balance: balance,
        compound: true,
      };

      return success;
    }
  } catch (error) {
    console.log(`Furpool: failed`);
    console.error(error);

    // failed
    const fail = {
      type: "Furpool",
      compound: false,
    };

    return fail;
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
const sendReport = async (report) => {
  // get the formatted date
  const today = todayDate();

  // get price of Furio
  const price = await furioPrice();
  report.push(price);
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
      console.log(error);
    } else {
      console.log("Email sent: " + info.response);
    }
  });
};

main();
