l("MAO server started.");
// function handler : express
var express = require('express');
var app = express();
var http = require('http').Server(app);

// Route handler, sends index.html when root address is hit.
app.use(express.static(__dirname + '/public'));

app.get("/room/", function(req, res){
	res.sendFile(__dirname + "/public/index.html");
});

app.get("/room/:roomID", function(req, res){
	res.sendFile(__dirname + "/public/index.html");
});

var io = require('socket.io')(http);

const PORTNUMBER = 6060;

// HTTP server, listen for activity on port
http.listen(PORTNUMBER, function(){
	l("Public server started, listening on port " + PORTNUMBER);
	l("You may now connect to localhost:" + PORTNUMBER)
	init();
});

// Hashing card IDs
var Hashids = require('hashids');
var userhashids = new Hashids(); //TODO hash user ids
var cardhashids = new Hashids(Math.random()*42);

// Username generator
var Moniker = require("moniker")
var userGen = Moniker.generator([Moniker.adjective, Moniker.noun])
userGen.maxSize = 12;
userGen.glue = "";

// Libraries
String.prototype.sanitise = function() {
	return this.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
};

String.prototype.striped = function() {
	return this.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").toLowerCase();
};

Object.prototype.getKeyByValue = function(value) {
	return Object.keys(this).find(key => this[key] === value);
};

Array.prototype.removeBlanks = function() {
	for (let e of this.entries())
		if (e[1] === "")
			this.remove(e[0]); // delete ""
};

Array.prototype.shuffle = function() {
	var array = this;
	var current = array.length, swap, random;
	// While there are elements left to shuffle (!= 0)
	while (current) {
		// Pick a random remaining element
		random = Math.floor(Math.random() * current--);
		// Swap with current element
		swap = array[current];
		array[current] = array[random];
		array[random] = swap;
	}
	return array;
};

Array.prototype.remove = function(index) {
	return this.splice(index, 1)[0];
};

Array.prototype.contains = function(obj) {
	return this.indexOf(obj) > -1;
}


// logging library
function l(string, roomID, userID) {
	var special = "";
	var special2 = "";
	if(roomID !== undefined)
		special = roomID + " * ";
	if(userID !== undefined)
		special2 = userID + " * ";
	console.log(new Date().toLocaleString() + " * " + special + special2 + string)
}
function i(string){
	console.log(new Date().toLocaleString() + " i " + string)	
}
function c(string) {
	console.log(new Date().toLocaleString() + " > " + string)
}
function e(string){
	console.error(new Date().toLocaleString() + " ! " + "[" + e.caller.name + "] " + string)
}

var rooms = {};

const RED = 'red';
const BLACK = 'black';

const FORMAT = {DEFAULT: 0, IMPORTANT: 1, DEBUG: 2, ERROR: 3};

const DISPLAY = {default: "", back: "back", alternate: "altuser", pile: "pile", deck: "deck", user: "user"};

// server start calls
function init() {
	setTimeout(function(){
		//refreshClients();
	}, 1000); // connected clients have time to reconnect before reloading DEBUG ENABLED
	rooms = {};
	i("Server initialised.")
}

function refreshClients() {
	rooms = {};
	io.emit("refresh");
	i("Refreshed connected clients.")
}

// console input handler
var stdin = process.openStdin();
stdin.addListener("data", function(d) {
	str = d.toString().trim().toLowerCase();
	if (str.split(" ")[0] == "broadcast"){
		c("yell> " + str.slice(9));
		io.emit("output", {str: str.slice(9), format: FORMAT.IMPORTANT});
	}
	else if (str.split(" ")[0] == "emit") {
		c("emit> " + str.slice(4));
		io.emit(str.slice(4));		
	}
	else {
		c("exec> " + str);
		Command.executeMultiple(str);
	}
});


class Room {
	constructor(id){
		this.id = id;
		this.users = {};
		l("Room created.", this.id)
		/* Resetting in the constructor causes
		 * bizzare behaviour, don't do it. */
	}
	reset(){
		l("Room resetting...", this.id)
		this.users = {};
		this.game = new MaoGame(this.id);
		l("Room reset.", this.id)
	}

	removeUser(userID) {
		delete this.users[userID];
		// remove player from queue
		this.game.queue.remove(this.game.queue.indexOf(userID));
		l("Removed user " + userID, this.id)
	}
}

class User {
	constructor(socket, name) {
		this.socket = socket;
		this.name = name;
		this.spectating = false;
		l("User " + this.name + " created.", this.roomID, this.id);
	}
	get id() {
		return this.socket.id;
	}
	get roomID() {
		return this.socket.roomID;
	}
	reset(){
		delete this.hand;
		this.spectating = false;
		l("User reset.", this.roomID, this.id);
	}

	createHand() {
		this.hand = new CardStack(this.id, this.roomID);
		l("Hand created.", this.roomID, this.id);
	}

	get isPlayer() {
		return (!this.spectating && this.roomID !== undefined)
	}

	get isInPlay(){
		try{
			return (this.isPlayer && rooms[this.roomID].game.isPlaying)
		} catch(e) {// game doesn't exist, so not in play
			return false;
		}
	}

	static generateName() {
		return userGen.choose();
	}
}

// network handler
io.on('connection', (socket) => {
	l("Connected", undefined, socket.id);

	socket.user = new User(socket, User.generateName());

	socket.on("join room", function(roomID){
		socket.roomID = roomID;

		l("Joining room...", roomID, socket.id)

		// Leave any previous rooms
		Object.keys(io.sockets.adapter.sids[socket.id]).filter(item => item!=socket.id).forEach(function(id, index){
			throw "user was still in room " + id;
			//leaveRoom(roomID, socket);
		});

		// Make new room if it doesn't exist.
		if (typeof rooms[roomID] === "undefined") {
			l("Making new room (it doesn't exist)", roomID, socket.id)
			rooms[roomID] = new Room(roomID);
			rooms[roomID].reset();
			l("Room made.", roomID, socket.id)
		}
		// Add user to the room
		l("Adding user to room.", roomID, socket.id);
		rooms[roomID].users[socket.id] = socket.user;
		socket.join(roomID);
		l("User added to room.", roomID, socket.id);

		// Push user count to all clients
		io.in(roomID).emit("user count", Object.keys(rooms[roomID].users).length);

		// Reset display of user
		l("Resetting user's display.", roomID, socket.id)
		socket.emit("reset display");

		// Join the game if it has not started
		if(!rooms[roomID].game.isPlaying) {
			// User gets a hand
			l("Game has not started - joining as player.", roomID, socket.id);
			l("Creating own hand.", roomID, socket.id);
			rooms[roomID].users[socket.id].createHand();
			// Display empty hand to everyone else in room
			l("Displaying hand to all.", roomID, socket.id);
			socket.to(roomID).emit("new cardstack", {title: rooms[roomID].users[socket.id].name, id: rooms[roomID].users[socket.id].hand.id, display: DISPLAY.alternate});
			// Display all hands (including self) to new user
			l("Showing all hands to user.", roomID, socket.id);
			socket.emit("new cardstacks", rooms[roomID].game.getAllCardStacks(socket));

			// Show play button if enough players ready
			if(Object.keys(rooms[roomID].users).length > 1){
				l("Enough players to start, showing begin.", roomID, socket.id)
				io.in(roomID).emit("show begin");
			}
			l("Joined room as player..", roomID, socket.id);
		} else {
			// spectator mode, join next round
			l("Game has started - joining in spectator mode.", roomID, socket.id);
			rooms[roomID].game.displayAll(socket);
			rooms[roomID].users[socket.id].spectating = true;
			l("Joined room in spectator mode.", roomID, socket.id)
		}
	});

	// Handle messages from textbox
	socket.on("command", function(data) {
		l("> " + data, socket.roomID, socket.id);
		if(socket.user.isPlayer){
			io.in(socket.roomID).emit("message", {name: rooms[socket.roomID].users[socket.id].name, id: rooms[socket.roomID].users[socket.id].hand.id, message: data}); // send as message to all regardless of command.
			Command.executeMultiple(data, socket.roomID, socket.id);
		}
	});

	socket.on("play card", function(data){
		if(socket.user.isInPlay){
			var room = socket.roomID;
			var origin = data.origin.replace("cardstack-", "");
			// decode card ID, convert to object
			var cardID = cardhashids.decode(data.cardID.replace("card-", ""));
			var destination = data.destination.replace("cardstack-", "");
			var movingCard = new Card(Card.getValueFromID(cardID), Card.getSuitFromID(cardID));
			l("Moving " + movingCard.toString() + " from " + origin + " to " + destination, room, socket.id);

			// try catch throw exceptions
			// play card logic TODO: functionalise
			if (origin == destination) {
				// Didn't move, so do nothing.
				l("Origin = destination, no move.")
				return;
			} else if (origin == "deck"){
				if (destination == socket.id) {
					// force taking from the top of the deck
					rooms[room].users[socket.id].hand.addCardToTop(rooms[room].game.deck.playCard(rooms[room].game.deck.cards[0]));
					rooms[room].game.attemptTurn(socket);
					// If they drew a card, they get the card,
					// as well as the penalty card.
					l("Moved from deck to hand.")
				} else {
					// can't draw cards for other players
					l("Can't move from deck to " + destination)
				}
			} else if (origin == socket.id) {
				if (rooms[room].users[socket.id].hand.hasCard(movingCard)){
					if (destination == "pile"){
						// can move from hand to play cards.
						if(rooms[room].game.attemptTurn(socket)){
							rooms[room].game.pile.addCardToTop(rooms[room].users[socket.id].hand.playCard(movingCard));
							l("Moved from hand to pile.")
						}
						// If they played out of turn, don't play card to pile.
					} else {
						// can move from hand to other hand for specific rules (IMPLEMENT LATER.)
						// for now, can't do that.
						l("Can't move from hand to " + destination)
					}
				} else {
					// you don't have that card
					// no penalty.
					// make a big EXCEPTION because how would this happen?
					l("Hand doesn't have that card.")
				}
			} else if (origin == "pile") {
				// can't move cards from the pile.
				l("Can't move cards from the pile.")
			} else {
				// attempted move from another player's hand.
				// can't do that.
				l("Can't move cards from other hands.");
			}
		}
	});

	socket.on("sort hand", function(){
		if(socket.user.isInPlay){
			l("Sorting hand.", socket.roomID, socket.id)
			rooms[socket.roomID].users[socket.id].hand.sort();
		}
	});

	socket.on("begin", function(){
		if(socket.roomID !== undefined){
			l("Sent begin.", socket.roomID, socket.id)
			if(Object.keys(rooms[socket.roomID].users).length > 1){
				io.in(socket.roomID).emit('hide begin')
				rooms[socket.roomID].game.start(socket.id);
			} else {
				l("Not enough players to start game", socket.roomID, socket.id);
			}
		}
	});

	socket.on("set username", function(name) {
		l("Setting username to " + name, socket.roomID, socket.id);
		if(socket.user.isPlayer){
			Object.keys(rooms[socket.roomID].users).forEach(function(userID, index){
				if(rooms[socket.roomID].users[userID].name == name){
					name = name + "2";
				}
			});
			socket.user.name = name;
			rooms[socket.roomID].users[socket.id].name = name;
			io.to(socket.roomID).emit("rename user", {id: rooms[socket.roomID].users[socket.id].hand.id, name: name});
			socket.emit("rename user", {id: rooms[socket.roomID].users[socket.id].hand.id, name: name + " <small>(you)</small>"});
			l("Username set to " + name, socket.roomID, socket.id);
		}
	});

	socket.on("leave room", function() {
		l("Leaving room...", socket.roomID, socket.id)
		if(socket.roomID !== "undefined"){
			socket.leave(socket.roomID);
			leaveRoom(socket);
			socket.user.reset();
		}
		l("Left room.", socket.roomID, socket.id);
		socket.roomID = undefined;
	});


	socket.on("disconnect", function(){
		l("Disconnecting...", socket.roomID, socket.id)
		if(socket.roomID !== "undefined")
			leaveRoom(socket);
		l("Disconnected", socket.roomID, socket.id);
	});
});

function leaveRoom(socket) {
	var room = socket.roomID;
	var id = socket.id;
	l("Leaving room...", room, id);

	// surround in try catch - room may not exist
	if(rooms[room] === undefined){
		console.log("Room doesn't exist")
		return;
	}
	if(rooms[room].users[id] === undefined){
		console.log("User doesn't exist in room")
		return;
	}

	if(!rooms[room].users[id].spectating)
		socket.to(room).emit("del cardstack", {id: rooms[room].users[id].hand.id});

	rooms[room].removeUser(id);
	if(Object.keys(rooms[room].users).length === 0){
		delete rooms[room];
		l("Room closed - noone in room, now", room, id)
	} else {
		io.in(room).emit("user count", Object.keys(rooms[room].users).length);
		// If now, not enough players to start
		if(rooms[room].game.isPlaying){
			// 'end game' if only 1 player left.
			if(rooms[room].game.queue.length < 2){
				rooms[room].game.reset();
				l("Game reset, not enough players now.", room, id)
			}
		} else {
			if(Object.keys(rooms[room].users).length === 1){
				io.in(room).emit('hide begin');
				l("Not enough players to begin, now.", room, id);
			}
		}
	}
	l("Left room.", room, id)
}

// handle commands by players
class Command {
	constructor(aliases, toRun){
		this.aliases = aliases;
		this.toRun = toRun;
	}

	isAlias(str){
		return this.aliases.contains(str);
	}
	// executes comma separated commands
	static executeMultiple(str, room, userID) {
		var output = [];
		str.split(", ").forEach(function(piece){
			output.push(Command.execute(piece, room, userID));
		});
		//return output.join(BREAK);
	}
	// executes single command
	static execute(str, room, userID){
		var command = str.striped().sanitise();

		Object.keys(commands).forEach(function(name){
			if(commands[name].isAlias(command)){
				i("Executing " + name + "...");
				commands[name].toRun(room, userID);
				return;
			}
		});
	}
}

commands = 	{reset: new Command(["reset"], function(){
				init();
			}),
			refresh: new Command(["refresh"], refreshClients)
			};

class CardStack {
	constructor(id, room) {
		this.userID = id;
		this.room = room;
		this.id = "cardstack-" + id; // used for display
		l("Creating CardStack", this.room, this.id);
		this.cards = [];
		this.clearDisplay();
		l("CardStack created", this.room, this.id);
	};

	get isEmpty() {
		return this.cards.length == 0;
	};

	get length() {
		return this.cards.length;
	};

	getIndex(card) {
		return this.cards.findIndex(card2 => card2.id === card.id);
	};

	hasCard(card) {
		return this.getIndex(card) > -1;
	};

	updateDisplay() {
		io.in(this.room).emit("clear cardstack", {id: this.id});
		this.displayHand();
		this.displayCount();
		l("Sent update display.", this.room, this.id);
	}
	// to an individual user
	refreshDisplay(socket) {
		socket.emit("clear cardstack", {id: this.id});
		socket.emit("display cards", {id: this.id, cards: this.toDisplay()});
		socket.emit("display cardcount", {id: this.id, count: this.length});
		l("Refreshed display.", this.room, this.id)
	}

	displayRemoveCard(card) {
		io.in(this.room).emit("display remove card", {id: this.id, cardID: card.id});
		//l("Removing card in all displays.", this.room, this.id);
	}

	// displays whole hand.
	displayHand() {
		io.in(this.room).emit("display cards", {id: this.id, cards: this.toDisplay()});
		l("Displaying hand.", this.room, this.id);
	}

	toDisplay() {
		var displayCards = [];
		this.cards.forEach(function(card){
			displayCards.push(card.toDisplay(this.userID));
		}, this);
		return displayCards;
	}
	// card count
	displayCount() {
		io.in(this.room).emit("display cardcount", {id: this.id, count: this.length});
	}

	clearDisplay() {
		io.in(this.room).emit("clear cardstack", {id: this.id});
		// hide card count
		io.in(this.room).emit("display cardcount", {id: this.id});
		l("Cleared display.", this.room, this.id)
	}

	shuffle() {
		this.cards.shuffle();
		this.updateDisplay();
		l("Shuffled.", this.room, this.id)
	}

	sort() {
		this.cards.sort(function(a, b) {
			return a.numID - b.numID
		});
		this.updateDisplay();
		l("Sorted.", this.room, this.id)
	}

	addCardToBottom(card) {
		this.cards.push(card);
		io.in(this.room).emit("display card bottom", {id: this.id, card: card.toDisplay(this.userID)})
		this.displayCount();
		//l("Adding card to bottom", this.room, this.id);
	}

	addCardToTop(card){
		this.cards.unshift(card);
		io.in(this.room).emit("display card top", {id: this.id, card: card.toDisplay(this.userID)});
		this.displayCount();
		//l("Adding card to top", this.room, this.id);
	}

	removeCard(card){
		card = this.cards.remove(this.getIndex(card));
		return card;
	}

	playCard(card) {
		card = this.removeCard(card)
		this.displayRemoveCard(card);
		this.displayCount();
		return card;
	}

	emptyStack() {
		this.cards = [];
		this.clearDisplay();
		l("Stack emptied", this.room, this.id)
	}
}

var useJokers = false;


class Deck extends CardStack {
	constructor(id, room) {
		super(id, room);
	};

	make() {
		// clear deck
		this.emptyStack();

		// Deal Standard Cards
		for (let s = 0; s < 4; s++) // loop suits
			for (let v = 1; v < 14; v++) // loop values
				this.cards.push(new Card(VALUES[v], SUITS[s]));

		// Deal Jokers, if enabled
		if(useJokers){ // Red and Black Jokers
			this.cards.push(new Card(VALUES[0], SUITS[4]));
			this.cards.push(new Card(VALUES[0], SUITS[5]));
		}
		// Display cards
		this.updateDisplay()
		l("Deck made.", this.room, this.id);
	}

	// displays whole hand.
	displayHand() {
		super.displayHand();
	}
}

class Value {
	constructor(name, id, string, aliases) {
		this.name = name;
		this.id = id;
		this.string = string;
		this.aliases = aliases;
	}
	toString() {
		return this.string;
	}
	isAlias(str) {
		return this.aliases.contains(str);
	}
}

class Suit extends Value {
	constructor(name, id, string, aliases, colour) {
		super(name, id, string, aliases)
		this.colour = colour;
	}
}

const SUITS = [new Suit("Hearts", 0, "&hearts;", ["h", "heart", "hearts"], RED),
			 new Suit("Diamonds", 1, "&diams;", ["d", "diams", "diamond", "diamonds"], RED),
			 new Suit("Clubs", 2, "&clubs;", ["c", "club", "clubs"], BLACK),
			 new Suit("Spades", 3, "&spades;", ["s", "spade", "spades"], BLACK),
			 new Suit("Red", 4, "", ["red"], RED), new Suit("Black", 5, "", ["black"], BLACK)
			];

const VALUES = [new Value("Joker", 0, "JKR", ["joker"]), new Value("Ace", 1, "A", ["ace", "a", "1"]), new Value("2", 2, "2", ["two", "2"]),
			  new Value("3", 3, "3", ["three", "3"]), new Value("4", 4, "4", ["four", "4"]),
			  new Value("5", 5, "5", ["five", "5"]), new Value("6", 6, "6", ["six", "6"]),
			  new Value("7", 7, "7", ["seven", "7"]), new Value("8", 8, "8", ["eight", "8"]),
			  new Value("9", 9, "9", ["nine", "9"]), new Value("10", 10, "10", ["ten", "10"]),
			  new Value("Jack", 11, "J", ["jack", "j"]), new Value("Queen", 12, "Q", ["queen", "q"]),
			  new Value("King", 13, "K", ["king", "k"])
			 ];

class Card {
	constructor(value, suit) {
		this.value = value;
		this.suit = suit;
	}

	toString() {
		return [this.value, this.suit].join(" ");
	};
	toDisplayString() {
		// fix a formatting issue
		var value = this.value;
		var suit = this.suit + "&#xFE0E;";
		if(this.value == "") value = "<br>";
		else if(this.suit == "") suit = "<br>";
		return [value, suit].join("<br>");
	};
	// info used to display a specific card
	toDisplay() {
		return {colour: this.suit.colour, id: this.id, str: this.toDisplayString() };
	}
	// use 14 instead of 13 to ensure Joker gets its own distinct ID.
	get numID() {
		// normal card
		return ((this.suit.id)*14 + (this.value.id));
	};

	get id() {
		return "card-" + cardhashids.encode(this.numID);
	}

	static getSuitFromID(id) {
		return SUITS[Math.floor(id/14)];
	}

	static getValueFromID(id) {
		return VALUES[id%14];
	}
}

class MaoGame {
	constructor(roomID) {
		l("Game initialising...", roomID);
		this.roomID = roomID;
		this.reset();
		l("Game initialised.", this.roomID)
	}

	reset() {
		l("Game resetting...", this.roomID)
		this.deck = new Deck("deck", this.roomID);
		this.pile = new CardStack("pile", this.roomID);
		Object.keys(rooms[this.roomID].users).forEach(function(userID, index) {
			rooms[this.roomID].users[userID].createHand();
		}, this);
		this.isPlaying = false;
		this.queue = [];
		l("Game reset.", this.roomID)
	}

	start(firstUserID) {
		l("Game starting...", this.roomID);
		this.isPlaying = true;

		// make and shuffle the deck
		this.deck.make();
		l("Deck made.", this.roomID)
		this.deck.shuffle();
		l("Deck shuffled.", this.roomID);
		// everyone starts with 5 cards [TODO: change by # players]
		this.allDraw(5);
		// one pile card
		this.pile.addCardToTop(this.deck.playCard(this.deck.cards[0]));
		l("Starting card dealt.", this.roomID)
		this.queue = this.generateQueue(firstUserID);
		l("Game started.", this.roomID);
	}

	generateQueue(firstUserID){ // similar to setTable on clientside
		var queue = []; // main queue
		var queueEnd = []; // these play BEFORE firstUser
		Object.keys(rooms[this.roomID].users).forEach(function(userID, index){
			// Start with first user
			if (userID == firstUserID || queue.length > 0){
				queue.push(userID);
			} else {
				queueEnd.push(userID);
			}
		}, this);
		l("Queue created - start with " + firstUserID, this.roomID);
		return queue.concat(queueEnd);
	}

	nextTurn() {
		// move played user to bottom of queue
		this.queue.push(this.queue.shift());
		l("Next turn -> " + this.turn, this.roomID)	
	}

	get turn() {
		return this.queue[0];
	}

	allDraw(num) {
		// deal 5 cards to each player and update the deck
		Object.keys(rooms[this.roomID].users).forEach(function(id, index) {
			for(let n = 0; n < num; n++){
				rooms[this.roomID].users[id].hand.addCardToTop(this.deck.playCard(this.deck.cards[0]));
			}
		}, this);
		l(num + " card(s) dealt to all players.", this.roomID);
	}

	// set up table for new user (pile, deck, other users)
	getAllCardStacks(socket){
		var data = []
		data.push({title: "pile", id: this.pile.id, display: DISPLAY.pile});
		data.push({title: "deck", id: this.deck.id, display: DISPLAY.deck});

		Object.keys(rooms[this.roomID].users).forEach(function(id, index) {
			var disp = DISPLAY.alternate;
			var name = rooms[this.roomID].users[id].name;
			if(id == socket.id){
				disp = DISPLAY.user;
				name = name + " <small>(you)</small>";
			}
			try	{
				data.push({title: name, id: rooms[this.roomID].users[id].hand.id, display: disp});
			} catch(err) {}; 
			// don't need to send hand if they don't have one (spectators)
		}, this);
		return data;
	}

	// display table to user when game has already started
	displayAll(socket){
		socket.emit("new cardstacks", this.getAllCardStacks(socket));
		this.deck.refreshDisplay(socket);
		this.pile.refreshDisplay(socket);
		Object.keys(rooms[this.roomID].users).forEach(function(id, index) {
			try {
				rooms[this.roomID].users[id].hand.refreshDisplay(socket);
			} catch(err) {}; // no need to refresh display if they don't have a hand
		}, this);
	};

	attemptTurn(socket){
		if(socket.id == this.turn){
			i("Playing in turn.", socket.roomID, socket.id);
			// after successful turn, advance it.
			this.nextTurn();
			return true;
		} else {
			i("Playing OUT of turn.", socket.roomID, socket.id);
			// penalise for playing out of turn
			rooms[socket.roomID].users[socket.id].hand.addCardToTop(this.deck.playCard(this.deck.cards[0]));
			return false;
		}
	}
}
