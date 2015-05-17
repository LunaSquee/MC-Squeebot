#!/usr/bin/env node
var exec = require('child_process');
var http = require('http');
var url = require('url');
var net = require('net');
var sys = require('sys');
var path = require('path');
var readline = require('readline');
var fs = require('fs');
var util = require('util');
var colors = require('colors');
var settings = require('./settings.json');      // Settings file
var chatprefix = settings.prefix;               // Prefix for bot commands (Set in settings file!!!)
var serverdir = __dirname+"/"+settings.cwd;     // Minecraft server directory
var server_process = null;                      // Server process
var client = null;                              // IRC Relay client
var relayMuted = false;                         // Relay muted status
var restartCalled = false;                      // True if server is being restarted
var stopExEula = false;                         // True if the server was shut down because of no EULA file
var processargs = [];							// Arguments provided from console

process.on('uncaughtException', function (err) {
    mylog(err);
});

process.argv.forEach(function (val, index, array) {
  processargs.push(val);
});

// Stored UUIDs of all players for precision OP checking
var uuids = {};

// ADDONS
var warps = require('./warps.json');

// This is the list of all your commands.
// "command":{"action":YOUR FUNCTION HERE, "description":COMMAND USAGE(IF NOT PRESENT, WONT SHOW UP IN !commands)}
var commands = {
    "np":{"action":(function(username, message, simplified, op) {
        getCurrentSongData(function(d, e, i) { 
            if(i) { 
                sendMessage("@a", d+" - "+e+" listener"+(e!==1?"s":""), "white", 1);
            } else { 
                sendMessage("@a", d, "white", 1);
            }
        });
    }), "description": "- Currently playing song on Parasprite Radio"},

    "help":{"action":(function(username, message, simplified, op) {
        listCommands();
    }), "description": "- List of all commands"},

    "clear":{"action":(function(username, message, simplified, op) {
        server_process.stdin.write("weather clear\r");
    })},

    "relay":{"action":(function(username, message, simplified, op) {
        if(op) {
            if(simplified[1] && simplified[1].toLowerCase() == "mute") {
                relayMuted = true;
                sendMessage("@a", "[IRCRelay] IRC relay has been muted.", "red", 3);
            } else if(simplified[1] && simplified[1].toLowerCase() == "unmute") {
                relayMuted = false;
                sendMessage("@a", "[IRCRelay] IRC relay has been unmuted.", "green", 3);
            } else {
                sendMessage(username, "Usage: !relay <mute/unmute>", "red", 1);
            }
        } else {
            sendMessage(username, "You must be an opped player do to that!", "red", 1);
        }
    })},

    "playerhead":{"action":(function(username, message, simplified, op) {
        if(simplified[1] !=null ) {
            var amount = 1;
            if(simplified[2] && parseInt(simplified[2]))
                amount = (parseInt(simplified[2]) > 64 ? 64 : simplified[2]);
            server_process.stdin.write("give "+username+" minecraft:skull "+amount+" 3 {SkullOwner:\""+simplified[1]+"\"}\r");
        } else {
            sendMessage(username, "Usage: !playerHead <playerName>", "red", 1);
        }
    }), "description": "<playerName> [amount] - Give yourself the head of a specified player"},

    "warps":{"action":(function(username, message, simplified, op) {
        var dimension = simplified[1]!=null ? (simplified[1].toLowerCase() === "overworld" || simplified[1].toLowerCase() === "nether" || simplified[1].toLowerCase() === "end" ? simplified[1] : "overworld") : "overworld"
        sendMessage(username, "--- Currently available warps for "+dimension+" ---", "dark_green", 3);
        warpWorker(username, dimension);
        sendMessage(username, "WARNING! DO NOT USE "+dimension.toUpperCase()+" WARPS IN ANY OTHER DIMENSION!!!", "red", 3);
        sendMessage(username, "End of warps", "green", 3);
    }), "description": "[<dimension>] - List of warps for dimension"},

    "warp":{"action":(function(username, message, simplified, op) {
        if(simplified[1] == "add") {
            if(op) {
                var datar = getWarpAddArguments(message, 1);
                if(datar) {
                    var newconstr = [datar.cString, datar.c, datar.d];
                    warps.locations[datar.n] = newconstr;
                    sendMessage(username, "Added warp "+datar.n+":"+newconstr, "green", 1);
                } else {
                    sendMessage(username, "Usage: !warp add <x> <y> <z> <dimension> <color> <name>", "red", 1);
                }
            } else {
                sendMessage(username, "You must be an opped player to do that!", "red", 1);
            }
        } else if(simplified[1] == "save"){
            if(op) {
                ReWriteWarpFile(username);
            } else {
                sendMessage(username, "You must be an opped player to do that!", "red", 1);
            }
        } else if(simplified[1] == "remove"){
            if(op) {
                var locat = simplified.slice(2).join(" ");
                if(locat in warps.locations) {
                    delete warps.locations[locat];
                    sendMessage(username, "Deleted warp "+locat+"", "green", 1);
                } else {
                    sendMessage(username, "That warp does not exist!", "red", 1);
                }
            } else {
                sendMessage(username, "You do not have permission to do that!", "red", 1);
            }
        } else {
            warp(username, message);
        }
    }), "description": "<location> - Warp to a location"},
}

// API object can be used in addons
var botapi = {
    sendMessage: sendMessage,
    isOp: isOp,
    JSONGrabber: JSONGrabber,
    info: info,
    log: mylog
}

// Run a command
function terminalCommand(command, callback) {
	var child = exec.exec(command, callback);
}

function downloadGameserver(version) {
	var verurl = "http://s3.amazonaws.com/Minecraft.Download/versions/%s/minecraft_server.%s.jar".format(version, version);
	terminalCommand("mkdir -p ./dumps/", function(err, stdout, stderr) {
		if(err) {
			info("An error occured trying to download server file.");
			return;
		}
		var options_e = {
			host: url.parse(verurl).host,
			port: 80,
			path: url.parse(verurl).pathname
		}
		var fname = settings.jarname;
		var fileee = fs.createWriteStream("./dumps/"+fname);
		info("Starting download...");
		http.get(options_e, function(res) {
			var len = res.headers["content-length"]
			res.on('data', function(data) {
				fileee.write(data);
				var progress = (fileee.bytesWritten / len * 100).toFixed(2);
				var mb = (fileee.bytesWritten / 1024 / 1024).toFixed(1);
				var mbtotal = (len / 1024 / 1024).toFixed(1);
				process.stdout.write("Downloading "+mb+"MB of "+mbtotal+"MB ("+progress+"%)\015");
			}).on('end', function() {
				info("Server successfully downloaded!");
				terminalCommand("mkdir -p "+settings.cwd+" && mv -f ./dumps/"+fname+" "+settings.cwd+"/"+fname, function(err, stdout, stderr) {
					if(err) {
						info("An error occured trying to move server file from dumps.");
						return;
					}
					info("Server is ready! Use '!server restart' to launch it!");
				});
			}).on('error', function(err) {
				info("An error occured trying to download server file.");
			});
		});
	});
}

// List of all commands
function listCommands() {
    sendMessage("@a", "--- Currently available commands for "+settings.botname+" ---", "dark_green", 3);
    for(var command in commands) {
        var dir = commands[command];
        if("description" in dir) {
            sendMessage("@a", chatprefix+command+" "+dir.description, "white", 3);
        }
    }
    sendMessage("@a", "--- End of commands ---", "green", 3);
}

// Check if player is a server operator or not using their UUID stored in the uuids object. Returns an array.
function isOp(username) {
    if(!username in uuids) return null;

    var opSuccess = null;
    var obj = JSON.parse(fs.readFileSync(serverdir+'/ops.json', 'utf8'));
    if(obj) {
        obj.forEach(function(arr) {
            if(arr.uuid === uuids[username]){
                opSuccess = [true, arr];
            }
        });
    }
    return opSuccess;
}

// List of all warps. Returns a json string.
function listWarps(requester, dim) {
    var extlist = [];

    for(var loc in warps.locations) {
        var obj = warps.locations[loc];
        if(obj[2] === dim) {
            extlist.push({text:"["+loc+"]", clickEvent:{action:"run_command", value:"/tp "+requester+" "+obj[0]}, hoverEvent:{action:"show_text", value:{text:obj[0], color:"blue"}}, color:obj[1]});
        }
    }
    return JSON.stringify(extlist);
}

// Print a readable list of warps into the chat.
function warpWorker(username, dimension) {
    var lowercase = dimension.toLowerCase();
    var dimensionVerify = (lowercase === "overworld" || lowercase === "nether" || lowercase === "end" ? lowercase : "overworld");
    var list = listWarps(username, dimensionVerify);
    var mesd = "tellraw "+username+" {\"text\":\"%s\", \"extra\": %s}";
    var sauce = util.format(mesd, warps.message, list);
    server_process.stdin.write(sauce+'\r');
}

// Warp command handler
function warp(username, mesg) {
    var loc = mesg.substring(6);
    if(loc != null && loc in warps.locations){
        var jsn = JSON.stringify({text:"Warped to ", color:"dark_aqua", extra:[{text:"["+loc+"]", color:warps.locations[loc][1], hoverEvent:{action:"show_text", value:{text:warps.locations[loc][0], color:"blue"}}}]});
        server_process.stdin.write('tp '+username+' '+warps.locations[loc][0]+'\r');
        server_process.stdin.write('tellraw '+username+' '+jsn+'\r');
    } else {
        sendMessage(username, "That warp does not exist.", "red", 3);
    }
}

// Grab JSON from an url 
function JSONGrabber(url, callback) {
    http.get(url, function(res){
        var data = '';

        res.on('data', function (chunk){
            data += chunk;
        });

        res.on('end',function(){
            var obj = JSON.parse(data);
            callback(true, obj);
        })

    }).on('error', function(e) {
        callback(false, e.message);
    });
}

// Grabs song data from icecast (Parasprite Radio)
function getCurrentSongData(callback) {
    JSONGrabber("http://radio.djazz.se/icecast.php", function(success, content) {
        if(success) {
            if(content.title != null) {
                var theTitle = new Buffer(content.title, "utf8").toString("utf8");
                var splitUp = theTitle.replace(/\&amp;/g, "&").split(" - ");
                if(splitUp.length===2) {
                    theTitle=splitUp[1]+(splitUp[0]?" by "+splitUp[0]:"");
                }
                callback(theTitle, content.listeners, true);
            } else {
                callback("Parasprite Radio is offline!", "", false);
            }
        } else {
            callback("Parasprite Radio is offline!", "", false);
        }
    });
}

// Initializes IRC relay
function initIrc() {
    if (client) return;
    if (!settings.ircRelay.enabled) return;

    var lastDataTimeout = null;

    function keepAlive() {
        clearTimeout(lastDataTimeout);
        lastDataTimeout = setTimeout(function () {
            if (!client) return;
            info('RELAY: Connection timed out');
            client.destroy();
        }, 30*1000);
    }

    info('RELAY: Connecting to %s:%d', settings.ircRelay.host, settings.ircRelay.port);
    client = net.connect({port: settings.ircRelay.port, host: settings.ircRelay.host}, function () {
        clearTimeout(connectTimer);
        client.write(settings.ircRelay.password);
    });
    client.setEncoding('utf8');
    
    client.on('data', function (data) {
        var ircMessage = data.match(/([^:]*)>([^:]*):([^:]*):(.*)/);
        if (ircMessage != null) {
            if(relayMuted) return;
            var type = ircMessage[1];
            if(type==="PRIVMSG") {
                sendMessage("@a", '['+ircMessage[3]+'] '+ircMessage[2]+': '+ircMessage[4], "white", 3);
            } else if(type==="JOIN") {
                sendMessage("@a", '['+ircMessage[3]+'] '+ircMessage[2]+''+ircMessage[4]+''+ircMessage[3], "dark_green", 3);
            } else if(type==="PART") {
                sendMessage("@a", '['+ircMessage[3]+'] '+ircMessage[2]+''+ircMessage[4]+''+ircMessage[3], "red", 3);
            } else if(type==="KICK") {
                sendMessage("@a", '['+ircMessage[3]+'] '+ircMessage[2]+''+ircMessage[4], "red", 3);
            } else if(type==="QUIT") {
                sendMessage("@a", '[IRC] '+ircMessage[2]+''+ircMessage[4], "red", 3);
            } else if(type==="NICK") {
                sendMessage("@a", '[IRC] '+ircMessage[2]+''+ircMessage[4], "yellow", 3);
            } else if(type==="ACTION") {
                sendMessage("@a", '['+ircMessage[3]+'] * '+ircMessage[2]+' '+ircMessage[4], "white", 3);
            }
        } else if (data === 'ping') {
            client.write('pong');
            //info('RELAY: Responding to ping');
        } else {
            info('RELAY: Server says: %s', data);
        }
        keepAlive();
    });
    client.once('end', function () {
        info('RELAY: Disconnected');
        clearTimeout(connectTimer);
    });
    client.on('error', function (err) {
        info('RELAY: '+err);
        client.destroy();
    });
    client.once('close', function () {
        info('RELAY: Connection closed');
        client = null;
        clearTimeout(connectTimer);
        clearTimeout(lastDataTimeout);
        setTimeout(initIrc, settings.ircRelay.reconnectInterval*1000);
    });
    var connectTimer = setTimeout(function () {
        info('RELAY: Timed out');
        client && client.destroy();
    }, 5*1000);

}

// Sends a formatted message
function sendMessage(user, msg, color, type) {
    var def = {text:msg, color:color}
    switch(type) {
        case 1:
            def.text = "<%s> %s".format(settings.botname, msg);
            break;
        case 2:
            def.text = "* %s %s".format(settings.botname, msg);
            break;
        case 3:
            def.text = msg;
            break;
    }
    if (server_process) {
        mylog("<!BOT_"+settings.botname+"> Sent '"+def.text+"' to "+user);
        server_process.stdin.write("tellraw "+user+" "+JSON.stringify(def)+"\r");
    } else {
        info("A message was ommited. No server instance!");
    }
}

// Handles player-sent messages
function handleMessage(username, message, simplified) {
    var op = isOp(username) != null;
    if(simplified[0] && simplified[0].indexOf(chatprefix) === 0 && simplified[0].toLowerCase().substring(1) in commands) {
        var command = commands[simplified[0].toLowerCase().substring(1)];
        if("action" in command)
            command.action(username, message, simplified, op);
    }
}

// Handles all incoming messages from server
function processMessage(inp) {
    mylog(inp);
    var thing = inp.trim().match(/^\[(\d\d:\d\d:\d\d)\] \[([\w# ]+)\/(\w+)\]: (.*)$/);
    if(thing) {
        if(thing[2].toLowerCase().indexOf("server thread") === 0 && thing[4].indexOf("EULA") !== -1) {
            stopExEula = true;
            info("You need to agree to the EULA before starting the server.");
            mylog("Please read '"+("server/eula.txt").green+"' and call '!server restart'.");
        } else if(thing[2].toLowerCase().indexOf("user auth") === 0) {
            var uuidmsg = thing[4].match(/^UUID of player (.*) is (.*)$/);
            if(uuidmsg) {
                mylog("<!BOT_"+settings.botname+"> "+(uuidmsg[1] in uuids ? "Updated" : "Gathered")+" the UUID of "+uuidmsg[1]+" successfully!");
                uuids[uuidmsg[1]] = uuidmsg[2];
                return;
            }
        } else {
            var usrmsg = thing[4].match(/^<([^>]+)> (.*)/);
            if(usrmsg) {
                var simplified = usrmsg[2].replace(/\:/g, ' ').replace(/\,/g, ' ').replace(/\./g, ' ').replace(/\?/g, ' ').trim().split(' ');
                handleMessage(usrmsg[1], usrmsg[2], simplified)
            }
        }
    }
}

// Check if the server exists
function checkServerExists() {
	var fpath = path.resolve(serverdir+"/"+settings.jarname);
	if (fs.existsSync(fpath)) {
		info("Server file exist!");
		rl.question("Download a new server file anyway? [yes/no] ", function(answer) {
	        if (answer === 'yes') {
	        	rl.question("What minecraft version would you like? ", function(answer) {
	        		// TODO: check if valid version.
	        		downloadGameserver(answer);
	        	});
	        }
	    });
    	return;
	}
	info("Server file doesn't exist!");
	rl.question("Download server file? [yes/no] ", function(answer) {
        if (answer === 'yes') {
        	rl.question("What minecraft version would you like? ", function(answer) {
        		// TODO: check if valid version.
        		downloadGameserver(answer);
        	});
        }
    });
    return;
}

// Creates server process
function spawnserver() {
	var fpath = path.resolve(serverdir+"/"+settings.jarname);
	if (!fs.existsSync(fpath)) {
		checkServerExists();
		return;
	}
    restartCalled = false;
    stopExEula = false;
    server_process = exec.spawn(
        "java",
        ["-Xms"+settings.ramStart+"M", "-Xmx"+settings.ramMax+"M", "-jar", settings.jarname, "nogui"],
        { cwd:serverdir }
    );

    // Listens for output from server 
    server_process.stdout.on('data', function(data) {
        data.toString().trim().split("\n").forEach(function(d) {
            processMessage(d);
        });
    });

    // Listens for errors from server 
    server_process.stderr.on('data', function(data) {
        data.toString().trim().split("\n").forEach(function(d) {
            processMessage(d);
        });
    });

    // Server exited event
    server_process.on('exit', function(data) {
        server_process = null;
        if(restartCalled) {
            spawnserver();
            info("Restarting server!");
            return;
        } else if(stopExEula) return;
        process.exit(0);
    });
}

var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
rl.setPrompt("");

rl.on('line', function (line) {
    if (line === '') {
        return;
    } else if(line.indexOf("!bot ")!==-1) {
        var spliti = line.split(" ");
        var command = spliti[1];
        var msg = spliti.slice(2).join(" ");
        if(command === "say") {
            sendMessage("@a", msg, "white", 1);
        } else if(command === "act") {
            sendMessage("@a", msg, "white", 2);
        } else if(command === "warp") {
            if(spliti[2] == "add") {
                var datar = getWarpAddArguments(line, 0);
                if(datar) {
                    var newconstr = [datar.cString, datar.c, datar.d];
                    warps.locations[datar.n] = newconstr;
                    mylog("<!BOT_"+settings.botname+"> Added warp "+datar.n+":"+newconstr);
                } else {
                    mylog("<!BOT_"+settings.botname+"> Usage: !bot "+command+" <"+spliti[2]+"/save> <x> <y> <z> <dimension> <color> <name>");
                }
            } else if(spliti[2] == "save"){
                ReWriteWarpFile(null);
            } else if(spliti[2] == "remove"){
                var locat = spliti.slice(3).join(" ");
                if(locat in warps.locations) {
                    delete warps.locations[locat];
                    mylog("<!BOT_"+settings.botname+"> Warp "+locat+" has been removed!");
                } else {
                    mylog("<!BOT_"+settings.botname+"> Warp \""+locat+"\" does not exist!");
                }
            } else {
                mylog("<!BOT_"+settings.botname+"> Usage: !bot "+command+" <add/save> <x> <y> <z> <dimension> <color> <name>");
            }
        } else {
            mylog("<!BOT_"+settings.botname+"> Unrecognized Command '"+command+"'");
        }
    } else if(line.indexOf("!server ") !== -1){
        var spliti = line.split(" ");
        if(spliti[1]) {
            if(spliti[1] === "restart") {
                restartCalled = true;
                info("Attempting to restart.");
                if(server_process)
                    server_process.stdin.write('stop\r');
                else
                    spawnserver();
            } else if(spliti[1] === "download") {
            	checkServerExists();
            }
        }
    } else {
        if(server_process){
            server_process.stdin.write(line+'\r');
        }
    }
    rl.prompt(true);
});

rl.setPrompt(util.format("> ".bold.magenta), 2);

function mylog() {
    // rl.pause();
    rl.output.write('\x1b[2K\r');
    console.log.apply(console, Array.prototype.slice.call(arguments));
    // rl.resume();
    rl._refreshLine();
}

function info() {
    arguments[0] = "  -- ".magenta+arguments[0];
    mylog(util.format.apply(null, arguments));
}

function ReWriteWarpFile(username) {
    mylog("<!BOT_"+settings.botname+"> Saving warps.json...");
    fs.writeFile(__dirname+'/warps.json', JSON.stringify(warps), function (err) {
        if (err) return console.log(err);
        if(username){
            sendMessage(username, "Saved warps.json!", "green", 1);
        } else {
            mylog("<!BOT_"+settings.botname+"> Saved warps.json.");
        }
    });
}

function getWarpAddArguments(message, imv) {
    var splitit = message.split(" ");
    if(message.length >= 8-imv){
        // !bot warp add x y z dimension color name
        var xCoord = parseInt(splitit[3-imv]);
        var yCoord = parseInt(splitit[4-imv]);
        var zCoord = parseInt(splitit[5-imv]);
        var dimension = splitit[6-imv];
        var color = splitit[7-imv];
        var name = splitit.splice(8-imv);

        if(isNaN(xCoord) || isNaN(yCoord) || isNaN(zCoord))
            return null;

        if(dimension != "overworld" && dimension != "nether" && dimension != "end")
            return null;

        return {x:xCoord, y:yCoord, z:zCoord, d:dimension, c:color, n:name.join(" "), cString:"%s %s %s".format(xCoord,yCoord,zCoord)};
    }
}

String.prototype.format = function(){
  var args = Array.prototype.slice.call(arguments);
  args.unshift(this.valueOf());
  return util.format.apply(util, args);
};

if(processargs.indexOf("--nostart") === -1 && processargs.indexOf("-n") === -1)
	spawnserver();
else
	info("Server was not started. Run '!server restart' to start the server!");

if(processargs.indexOf("--norelay") === -1 && processargs.indexOf("-r") === -1)
	initIrc();
else
	info("Relay was not started!");
