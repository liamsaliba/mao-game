// function handler : express
var express = require('express');
var app = express();
var http = require('http').Server(app);

// Route handler, sends index.html when root address is hit.
app.use(express.static(__dirname + '/public'));

var io = require('socket.io')(http);

const PORTNUMBER = 6060;

// HTTP server, listen for activity on port
http.listen(PORTNUMBER, function(){
	l("Public server started, listening on port " + PORTNUMBER);
	init();
});

// Libraries
Array.prototype.remove = function(index) {
	return this.splice(index, 1)[0];
}

// logging library
function l(string) {
	console.log(new Date().toLocaleString() + " * " + string)
}
function c(string) {
	console.log(new Date().toLocaleString() + " > > " + string)
}
function e(string){
	console.error(new Date().toLocaleString() + " ! " + "[" + e.caller.name + "] " + string)
}


var users = {};

// server start calls
function init() {
	setTimeout(function(){
		refreshClients();
	}, 300)
	l("Server initialised.")
}

function refreshClients() {
	users = {};
	io.emit("refresh");
	l("Refreshed connected clients.")
}

// console input handler
var stdin = process.openStdin();
stdin.addListener("data", function(d) {
	str = d.toString().trim();
	c(str);
	if(str.charAt(0) == ".")
		io.emit("command", str.slice(1));
	else if (str.charAt(0) == "/")
		io.emit(str.slice(1));
	else io.emit("broadcast", str);
});


class User {
	constructor(socket) {
		this.socket = socket;
		l("User created id=" + this.id);
	}
	get id() {
		return this.socket.id;
	}
}

io.on('connection', (socket) => {
	users[socket.id] = new User(socket);
	l("Connected to client id=" + socket.id + "");
	io.emit("user count", Object.keys(users).length)

	socket.on('handshake', function() {
		l("Handshake from client id=" + socket.id)
	});

	socket.on("command", function(data) {
		l("Command from id=" + socket.id + " > " + data);
	});

	socket.on("disconnect", function(){
		delete users[socket.id];
		l("Disconnected from client id=" + socket.id + "");
	})
});

class MaoGame {
	constructor() {
		
	}


}