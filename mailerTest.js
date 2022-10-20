const nodemailer = require("nodemailer");
const fetch = require("cross-fetch");
require("dotenv").config();

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

const sendReport = async (report) => {
  // get formatted date
  let today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const yyyy = today.getFullYear();
  today = `${dd}/${mm}/${yyyy}`;

  //get price of Furio
  const price = await furioPrice();
  report.push(price);

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
    text: JSON.stringify(report),
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
