var nodemailer = require("nodemailer");
require("dotenv").config();

var transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_ADDR,
    pass: process.env.EMAIL_PW,
  },
});

var mailOptions = {
  from: process.env.EMAIL_ADDR,
  to: process.env.RECIPIENT,
  subject: "Sending Email using Node.js[nodemailer]",
  text: "That was easy!",
};

transporter.sendMail(mailOptions, function (error, info) {
  if (error) {
    console.log(error);
  } else {
    console.log("Email sent: " + info.response);
  }
});
