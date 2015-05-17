# Node Minecraft Server Bot
A cool bot that uses [node.js](http://nodejs.org/) and runs a minecraft server, adding more commands.

### Setting up
1. Clone this repository 
2. Install the dependencies `npm install`
3. Copy and modify the settings file `cp settings.example.json settings.json`
4. Start the server `node run.js`
It will prompt you to download the server. Answer yes and it will set up everything for you!

### Warps
The file `warps.json` contains the "warps" for dimensions. Warps are basically public places where every player can teleport to.
Adding a warp for a dimension goes like this: `"WARP NAME":["xCoord yCoord zCoord", "COLOR", "DIMENSION"]` Click [here](http://www.minecraftforum.net/forums/minecraft-discussion/redstone-discussion-and/351959#TEXTUALcolors) for a list of colors that you can use.

##### Adding warps from the console
To add a warp you must type in the following line in console: `!bot warp add x y z dimension color name`. `dimension` can be overworld, nether or end; color must be any one of [these](http://www.minecraftforum.net/forums/minecraft-discussion/redstone-discussion-and/351959#TEXTUALcolors) colors; name can have spaces in it, for example "Diamond Block". Once you have added the warp, type the following line in console: `!bot warp save`, this writes the created warps to the `warps.json` file.