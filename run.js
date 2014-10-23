#!/usr/bin/env node
var exec = require('child_process'),
    request = require('request'),
    readline = require('readline'),
    util = require('util'),
    colors = require('colors'),
    settings = require('./settings.json'),      // Settings file
    serverdir = __dirname+"/"+settings.cwd,  // Minecraft server directory
    server_process = null,                      // Server process
    commandslist = ["!commands - All commands", "!np - Currently playing song"];
    
    function getCurrentSongData(callback) {
        request({
            url: "http://radio.djazz.se/icecast.php",
            json: true
        }, function (error, response, body) {
            if (!error && response.statusCode === 200) {
                if(body.title != null) {
                    var theTitle = new Buffer(body.title, "utf8").toString("utf8");
                    var splitUp = theTitle.replace(/\&amp;/g, "&").split(" - ");
                    if(splitUp.length===2) {
                        theTitle=splitUp[1]+(splitUp[0]?" by "+splitUp[0]:"");
                    }
                    callback(theTitle, body.listeners, true);
                } else {
                    callback("Parasprite Radio is offline!", "", false);
                }
            } else {
                callback("Parasprite Radio is offline!", "", false);
            }
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
    
    String.prototype.format = function(){
      var args = Array.prototype.slice.call(arguments);
      args.unshift(this.valueOf());
      return util.format.apply(util, args);
    };
