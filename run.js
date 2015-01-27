#!/usr/bin/env node
var exec = require('child_process'),
    //request = require('request'),
    http = require('http'),
    net = require('net'),
    readline = require('readline'),
    fs = require('fs'),
    util = require('util'),
    colors = require('colors'),
    settings = require('./settings.json'),      // Settings file
    serverdir = __dirname+"/"+settings.cwd,  // Minecraft server directory
    server_process = null,                      // Server process
    commandslist = ["!commands - All commands", "!np - Currently playing song", "!warps [<dimension>] - List of warps for that dimension", "!warp <location> - Warp to a location"];
    
    // ADDONS
var warps = require('./warps.json');

    function isOp(username) {
        var opSuccess = null;
        var obj = JSON.parse(fs.readFileSync(serverdir+'/ops.json', 'utf8'));
        if(obj) {
            obj.forEach(function(arr) {
                if(arr.name === username){
                    opSuccess = [true, arr];
                }
            });
        }
        return opSuccess;
    }
    
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
    
    function warpWorker(username, dimension) {
        var lowercase = dimension.toLowerCase();
        var dimensionVerify = (lowercase === "overworld" || lowercase === "nether" || lowercase === "end" ? lowercase : "overworld");
        var list = listWarps(username, dimensionVerify);
        var mesd = "tellraw "+username+" {\"text\":\"%s\", \"extra\": %s}";
        var sauce = util.format(mesd, warps.message, list);
        server_process.stdin.write(sauce+'\r');
    }
    
    function warp(username, mesg) {
        var loc = mesg.substring(6);
        console.log(loc);
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

    function ircDataReceiveHandle(data, client) {
	if(data.match(/NOTICE Auth :/) != null){client.write('JOIN #BronyTalk\r\n');}
	var ircMessage = data.match(/:([^!]*)[^ ]* PRIVMSG #BronyTalk :(.*)/);
	if (ircMessage != null){
		sendMessage("@a", ircMessage[1]+': '+ircMessage[2], "white", 1);
	}
    }
    
    function initIrc() {
	var client = net.connect({port: 6667, host: 'irc.canternet.org'},
		function() { //'connect' listener
			console.log('connected to server!');
			client.setEncoding('utf8');
			client.on('data', function(chunk) { if(chunk.match(/PING :(.*)/) != null){client.write('PONG :'+chunk.match(/PING :(.*)/)[1]+'\r\n')}else{ircDataReceiveHandle(chunk, client);}});
			client.write('NICK SqueebotMC\r\n');
			client.write('USER SqueebotMC djazz.se irc.canternet.org :SqueebotMC\r\n');
	});
    }
    
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
        if(server_process) {
            mylog("<!BOT_"+settings.botname+"> Sent '"+def.text+"' to "+user);
            server_process.stdin.write("tellraw "+user+" "+JSON.stringify(def)+"\r");
        }
    }
    
    function handleMessage(username, message, simplified) {
        if(simplified[0]==="!np") {
            getCurrentSongData(function(d, e, i) { if(i) { sendMessage("@a", d+" - "+e+" listener"+(e!==1?"s":""), "white", 1);} else { sendMessage("@a", d, "white", 1)}});
        } 
        else if(simplified[0]==="!commands") {
            sendMessage("@a", "--- Currently available commands for "+settings.botname+" ---", "dark_green", 3);
            commandslist.forEach(function(d) {
                sendMessage("@a", d, "white", 3);
            });
            sendMessage("@a", "End of commands", "green", 3);
        }
        else if(simplified[0]==="!clear") {
            server_process.stdin.write("weather clear\r");
        }
        else if(simplified[0]==="!warp") {
            var op = isOp(username) != null;
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
                    if(simplified[2] in warps.locations) {
                        delete warps.locations[simplified[2]];
                        sendMessage(username, "Deleted warp "+simplified[2]+"", "green", 1);
                    } else {
                        sendMessage(username, "That warp does not exist!", "red", 1);
                    }
                } else {
                    sendMessage(username, "You do not have permission to do that!", "red", 1);
                }
            } else {
                warp(username, message);
            }
        }
        else if(simplified[0]==="!warps") {
        var dimension = simplified[1]!=null ? (simplified[1].toLowerCase() === "overworld" || simplified[1].toLowerCase() === "nether" || simplified[1].toLowerCase() === "end" ? simplified[1] : "overworld") : "overworld"
            sendMessage(username, "--- Currently available warps for "+dimension+" ---", "dark_green", 3);
            warpWorker(username, dimension);
            sendMessage(username, "WARNING! DO NOT USE "+dimension.toUpperCase()+" WARPS IN ANY OTHER DIMENSION!!!", "red", 3);
            sendMessage(username, "End of warps", "green", 3);
        }
    }
    
    function processMessage(inp) {
        mylog(inp);
        var thing = inp.trim().match(/^\[(\d\d:\d\d:\d\d)\] \[([\w ]+)\/(\w+)\]: (.*)$/);
        if(thing) {
            var usrmsg = thing[4].match(/^<([^>]+)> (.*)/);
            if(usrmsg) {
                var simplified = usrmsg[2].replace(/\:/g, ' ').replace(/\,/g, ' ').replace(/\./g, ' ').replace(/\?/g, ' ').trim().split(' ');
                handleMessage(usrmsg[1], usrmsg[2], simplified)
            }
        }
    }
    
    server_process = exec.spawn(
        "java",
        ["-Xms"+settings.ramStart+"M", "-Xmx"+settings.ramMax+"M", "-jar", settings.jarname, "nogui"],
        { cwd:serverdir }
    );
    initIrc();
    
    server_process.stdout.on('data', function(data) {
        data.toString().trim().split("\n").forEach(function(d) {
            processMessage(d);
        });
    });
    
    server_process.stderr.on('data', function(data) {
        data.toString().trim().split("\n").forEach(function(d) {
            processMessage(d);
        });
    });
    
    server_process.on('exit', function(data) {
        server_process = null;
        process.exit(0);
    });

    var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.setPrompt("");

    rl.on('line', function (line) {
        if (line === '') {
            return;
        } else if(line.indexOf("!bot ")!==-1) {
            var split = line.split(" ");
            var command = split[1];
            var msg = split.slice(2).join(" ");
            if(command === "say") {
                sendMessage("@a", msg, "white", 1);
            } else if(command === "act") {
                sendMessage("@a", msg, "white", 2);
            } else if(command === "warp") {
                if(split[2] == "add") {
                    var datar = getWarpAddArguments(line, 0);
                    if(datar) {
                        var newconstr = [datar.cString, datar.c, datar.d];
                        warps.locations[datar.n] = newconstr;
                        mylog("<!BOT_"+settings.botname+"> Added warp "+datar.n+":"+newconstr);
                    } else {
                        mylog("<!BOT_"+settings.botname+"> Usage: !bot "+command+" <"+split[2]+"/save> <x> <y> <z> <dimension> <color> <name>");
                    }
                } else if(split[2] == "save"){
                    ReWriteWarpFile(null);
                } else if(split[2] == "remove"){
                    if(split[3] in warps.locations) {
                        delete warps.locations[split[3]];
                        mylog("<!BOT_"+settings.botname+"> Warp "+split[3]+" has been removed!");
                    } else {
                        mylog("<!BOT_"+settings.botname+"> That warp does not exist!");
                    }
                } else {
                    mylog("<!BOT_"+settings.botname+"> Usage: !bot "+command+" <add/save> <x> <y> <z> <dimension> <color> <name>");
                }
            } else {
                mylog("<!BOT_"+settings.botname+"> Unrecognized Command '"+command+"'");
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
    
    function ReWriteWarpFile(username) {
        mylog("<!BOT_"+settings.botname+"> Saving warps.json...");
        fs.writeFile('./warps.json', JSON.stringify(warps), function (err) {
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
