# Node Minecraft Server Bot
A cool bot that uses [node.js](http://nodejs.org/) and runs a minecraft server, adding more commands.

### Setting up
1. Clone this repository 
2. Create a folder "server" and put a [minecraft server jar](https://minecraft.net/download) file into it (named `minecraft_server.jar`)
3. Install the dependencies `npm install`
4. Change settings in `settings.json`
5. Start the server `node run.js`

### Warps
The file `warps.json` contains the "warps" for dimensions. Warps are basically public places where every player can teleport to.
Adding a warp for a dimension goes like this: `"WARP NAME":["xCoord yCoord zCoord", "COLOR"]` Click [here](http://www.minecraftforum.net/forums/minecraft-discussion/redstone-discussion-and/351959#TEXTUALcolors) for a list of colors that you can use.
(I will add a console command for adding warps soon!)