# Furio Compound
![Furio](https://www.furio.io/file/2022/04/Social-Share-Image.jpg)


## Strategy 
Simple Bot to Restake tokens every 24h on Ronin chain. Creating compound interest with RON and AXS tokens. 

This strategy involves claiming the rewards (AXS tokens) and swapping the AXS tokens to RON and WETH to create LP tokens and deposit the LP tokens into the farm on the Katana DEX for RON rewards, thereby compounding the daily RON yields. 

URL: https://app.furio.io/?ref=0xFdD831b51DCdA2be256Edf12Cd81C6Af79b6D7Df 


# ENV Variables 
You will need to create a file called *.env* in the root directory, copy the text in *.env.example* and fill in the variables 


# How to Run 
You could run it on your desktop just using [Node.js](https://github.com/nodejs/node) in your terminal. However, on a production environment, it is recommended to use something like [PM2](https://github.com/Unitech/pm2) to run the processes to ensure robust uptime and management. 

### FUR Compound
```
pm2 start furio.js -n "FUR"
pm2 save

```
