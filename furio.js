/*
- RON Compound - 
This strategy involves claiming farm reward (RON tokens) and swapping the rewards to proportional RON and WETH to create LP tokens and deposit the LP tokens into the farm on the Katana DEX for RON rewards, thereby compounding the daily RON yields. 

URL: https://katana.roninchain.com/#/farm
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
];

// Import environment variables
const VAULT = process.env.CONTRACT_ADR;
const RPC_URL = process.env.BSC_RPC;
var wallets = [];

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
  for (let i = 1; i <= n; i++) {
    const wallet = {
      address: process.env["ADR_" + i],
      key: process.env["PVK_" + i],
      index: i,
    };
    wallets.push(wallet);
  }
};

// Ethers connect on each wallet
const connect = async (wallet) => {
  let connection = {};

  // Add connection properties
  connection.provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  connection.wallet = new ethers.Wallet(wallet.key, connection.provider);
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

  // get wallets
  initWallets(1);

  // storage array for sending reports
  let report = ["Furio Report " + todayDate()];

  // store last compound, schedule next
  restakes.previousRestake = new Date().toString();
  scheduleNext(new Date());

  // loop through for each wallet
  for (const wallet of wallets) {
    try {
      // connection using the current wallet
      const connection = await connect(wallet);

      // call the compound function and await the results
      const result = await connection.contract.compound();
      const receipt = await result.wait();

      // get the total balance currently locked in the vault
      const b = await connection.contract.participantBalance(wallet.address);
      const balance = ethers.utils.formatEther(b);

      // succeeded
      if (receipt) {
        console.log(`Wallet${wallet["index"]}:`, "success");
        console.log(`Vault Balance: ${balance} FUR`);

        const success = {
          index: wallet.index,
          wallet: wallet.address,
          balance: balance,
          compound: true,
        };

        report.push(success);
      }
    } catch (error) {
      console.log(`Wallet${wallet["index"]}:`, "failed!");
      console.error(error);

      // failed
      const fail = {
        index: wallet.index,
        wallet: wallet.address,
        compound: false,
      };

      report.push(fail);
    }
  }

  // report status daily
  report.push(restakes);
  sendReport(report);
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
    console.log(price);
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
    subject: "Furio Report " + today,
    text: JSON.stringify(report, null, 2),
  };

  // send the email message
  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      console.log(error);
    } else {
      console.log("Email sent: " + info.response);
    }
  });
};

main();
