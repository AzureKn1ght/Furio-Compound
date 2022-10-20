/*
- RON Compound - 
This strategy involves claiming farm reward (RON tokens) and swapping the rewards to proportional RON and WETH to create LP tokens and deposit the LP tokens into the farm on the Katana DEX for RON rewards, thereby compounding the daily RON yields. 

URL: https://katana.roninchain.com/#/farm
*/

// Import required node modules
const scheduler = require("node-schedule");
const { ethers } = require("ethers");
const figlet = require("figlet");
require("dotenv").config();
const fs = require("fs");

// ABI for the furio vault contract
const ABI = ["function compound() external returns (bool)"];

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

      // succeeded
      if (receipt) {
        console.log(`Wallet${wallet["index"]}:`, "success");
      }
    } catch (error) {
      console.log(`Wallet${wallet["index"]}:`, "failed!");
      console.error(error);
    }
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
      console.log("Data stored:\n", restakes);
    }
  });
};

main();
