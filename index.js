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

// logging library
function l(string) {
	console.log(new Date().toLocaleString() + " * " + "[" + l.caller.name + "] " + string)
}
function c(string) {
	console.log(new Date().toLocaleString() + " > > " + string)
}
function e(string){
	console.error(new Date().toLocaleString() + " ! " + "[" + e.caller.name + "] " + string)
}

// server start calls
function init() {
	l("Server initialised.")
}

// console input handler
var stdin = process.openStdin();
stdin.addListener("data", function(d) {
	str = d.toString().trim();
	c(str);
});

io.on('connection', (socket) => {
	l("Connected to client id=" + socket.id + "");

	socket.on('join', function() {
		l("Handshake from client id=" + socket.id)
	});
})

