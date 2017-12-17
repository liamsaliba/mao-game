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
var cardhashids;

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

	createUser(socket) {
		l("Creating user " + socket.id, this.id)
		this.users[socket.id] = new User(socket, this.id);
	}

	removeUser(userID) {
		delete this.users[userID];
		// remove player from queue
		this.game.queue.remove(this.game.queue.indexOf(userID));
		l("Removed user " + userID, this.id)
	}
}

class User {
	constructor(socket, room) {
		this.socket = socket;
		this.room = room;
		this.name = userGen.choose();
		this.spectator = false;
		l("User " + this.name + " created.", this.room, this.id);
	}
	get id() {
		return this.socket.id;
	}
	resetHand() {
		this.hand = new CardStack(this.id, this.room);
		l("Hand reset.", this.room, this.id);
	}

}

// network handler
io.on('connection', (socket) => {
	l("Connected", undefined, socket.id);
	
	socket.on("join room", function(room){
		l("Begin joining room...", room, socket.id)
		// Leave any previous rooms
		Object.keys(io.sockets.adapter.sids[socket.id]).filter(item => item!=socket.id).forEach(function(roomID, index){
			throw "user was still in room " + roomID;
			//leaveRoom(roomID, socket);
		});

		// Make new room if it doesn't exist.
		if (typeof rooms[room] === "undefined") {
			l("Making new room.", room, socket.id)
			rooms[room] = new Room(room);
			rooms[room].reset();
		}
		// Add user to the room
		l("Adding user to room.", room, socket.id);
		rooms[room].createUser(socket);
		socket.join(room);

		// Push user count to all clients
		io.in(room).emit("user count", Object.keys(rooms[room].users).length);

		// Reset display of user
		l("Resetting user's display.", room, socket.id)
		socket.emit("reset display");

		// Join the game if it has not started
		if(!rooms[room].game.playing) {
			// User gets a hand
			l("Game has not started - joining as player.", room, socket.id);
			l("Creating own hand.", room, socket.id);
			rooms[room].users[socket.id].resetHand();
			// Display empty hand to everyone else in room
			l("Displaying hand to all.", room, socket.id);
			socket.to(room).emit("new cardstack", {title: rooms[room].users[socket.id].name, id: rooms[room].users[socket.id].hand.id, display: DISPLAY.alternate});
			// Display all hands (including self) to new user
			l("Showing all hands to user.", room, socket.id);
			socket.emit("new cardstacks", rooms[room].game.getAllCardStacks(socket));

			// Show play button if enough players ready
			if(Object.keys(rooms[room].users).length > 1){
				l("Enough players to start, showing begin.", room, socket.id)
				io.in(room).emit("show begin");
			}
			l("Completed join.", room, socket.id);
			// Handle messages from textbox
			socket.on("command", function(data) {
				l("> " + data, room, socket.id);

				io.in(room).emit("message", {name: rooms[room].users[socket.id].name, id: rooms[room].users[socket.id].hand.id, message: data}); // send as message to all regardless of command.
				Command.executeMultiple(data, room, socket.id);
			});

			socket.on("play card", function(data){
				var origin = data.origin.replace("cardstack-", "");
				cardhashids = new Hashids(origin); 
				// decode card ID, convert to object
				var cardID = cardhashids.decode(data.cardID.replace("card-", ""));
				var destination = data.destination.replace("cardstack-", "");
				movingCard = new Card(Card.getValueFromID(cardID), Card.getSuitFromID(cardID));
				l("Moving " + movingCard.toString() + " from " + origin + " to " + destination, room, socket.id);

				if(socket.id == rooms[room].game.turn){
					i("Playing in turn.", room, socket.id);
				} else {
					i("Playing OUT of turn.", room, socket.id);
					// penalise
					rooms[room].users[socket.id].hand.addCardToTop(rooms[room].game.deck.playCard(rooms[room].game.deck.cards[0]));
					return;
				}
				// try catch throw exceptions
				// play card logic TODO: functionalise
				if (origin == destination) {
					// Nothing move, do nothing
					l("Origin = destination, no move.")
					return;
				} else if (origin == "deck"){
					if (destination == socket.id) {
						// force taking from the top of the deck
						rooms[room].users[socket.id].hand.addCardToTop(rooms[room].game.deck.playCard(rooms[room].game.deck.cards[0]));
						l("Moved from deck to hand.")
					} else {
						// can only pass to yourself, use penalty button
						// to penalise other players
						l("Can't move from deck to " + destination)
					}
				} else if (origin == socket.id) {
					if (rooms[room].users[socket.id].hand.hasCard(movingCard)){
						if (destination == "pile"){
							// can move from hand to play cards.
							rooms[room].game.pile.addCardToTop(rooms[room].users[socket.id].hand.playCard(movingCard))
							l("Moved from hand to pile.")
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
				// after successful turn, advance it.
				rooms[room].game.nextTurn();
			});

			socket.on("sort hand", function(){
				rooms[room].users[socket.id].hand.sort();
				l("Sorting hand.", room, socket.id)
			})

			socket.on("begin", function(){
				l("Sent begin.", room, socket.id)
				if(Object.keys(rooms[room].users).length > 1){
					io.in(room).emit('hide begin')
					rooms[room].game.start(socket.id);
				} else {
					l("Not enough players to start game", room, socket.id);
				}
			})
		} else {
			// spectator mode, join next round
			l("Game has started - joining in spectator mode.", room, socket.id);
			rooms[room].game.displayAll(socket);
			rooms[room].users[socket.id].spectator = true;
		}

		socket.on("set username", function(name) {
			try{
				Object.keys(rooms[room].users).forEach(function(userID, index){
					if(rooms[room].users[userID].name == name){
						throw "Same username";
					}
				});
				io.to(room).emit("rename user", {id: socket.id, name: name});
				socket.emit("rename user", {id: socket.id, name: name + " <small>(you)</small>"});

			} catch (e) {
				l(e);
			}
		})

		socket.on("leave room", function() {
			leaveRoom(room, socket);
		});


		socket.on("disconnect", function(){
			l("Disconnecting...", room, socket.id)
			leaveRoom(room, socket);
			l("Disconnected", room, socket.id);
		});
	});
});

function leaveRoom(room, socket) {
	l("Leaving room...", room, socket.id);
	socket.leave(room);
	// surround in try catch - room may not exist
	if(rooms[room] === undefined)
		return;
	if(rooms[room].users[socket.id] === undefined)
		return;

	if(!rooms[room].users[socket.id].spectator)
		socket.to(room).emit("del cardstack", {id: rooms[room].users[socket.id].hand.id});

	rooms[room].removeUser(socket.id);

	if(Object.keys(rooms[room].users).length === 0 ){
		delete rooms[room];
		l("Room closed - noone in room, now", room, socket.id)
	} else {
		io.in(room).emit("user count", Object.keys(rooms[room].users).length);
		// If now, not enough players to start
		if(rooms[room].game.playing){
			// 'end game' if only 1 player left.
			if(rooms[room].game.queue.length < 2){
				rooms[room].game.reset();
				l("Game reset, not enough players now.", room, socket.id)
			}
		} else {
			if(Object.keys(rooms[room].users).length === 1){
				io.in(room).emit('hide begin');
				l("Not enough players to begin, now.", room, socket.id);
			}
		}
	}
	l("Left room.", room, socket.id)
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
	toDisplay(parent) {
		cardhashids = new Hashids(parent);
		return {colour: this.suit.colour, id: "card-" + cardhashids.encode(this.numID), str: this.toDisplayString() };
	}
	// use 14 instead of 13 to ensure Joker gets its own distinct ID.
	get numID() {
		// normal card
		return ((this.suit.id)*14 + (this.value.id));
	};

	get id() {
		return "card-" + this.numID;
	}

	static getSuitFromID(id) {
		return SUITS[Math.floor(id/14)];
	}

	static getValueFromID(id) {
		return VALUES[id%14];
	}
}

class MaoGame {
	constructor(room) {
		l("Game initialising...", room);
		this.room = room;
		this.reset();
		l("Game initialised.", this.room)
	}

	reset() {
		l("Game resetting...", this.room)
		this.deck = new Deck("deck", this.room);
		this.pile = new CardStack("pile", this.room);
		Object.keys(rooms[this.room].users).forEach(function(userID, index) {
			rooms[this.room].users[userID].resetHand();
		}, this);
		this.playing = false;
		this.queue = [];
		l("Game reset.", this.room)
	}

	start(firstUserID) {
		l("Game starting...", this.room);
		this.playing = true;

		// make and shuffle the deck
		this.deck.make();
		l("Deck made.", this.room)
		this.deck.shuffle();
		l("Deck shuffled.", this.room);
		// everyone starts with 5 cards [TODO: change by # players]
		this.allDraw(5);
		// one pile card
		this.pile.addCardToTop(this.deck.playCard(this.deck.cards[0]));
		l("Starting card dealt.", this.room)
		this.queue = this.generateQueue(firstUserID);
		l("Game started.", this.room);
	}

	generateQueue(firstUserID){ // similar to setTable on clientside
		var queue = []; // main queue
		var queueEnd = []; // these play BEFORE firstUser
		Object.keys(rooms[this.room].users).forEach(function(userID, index){
			// Start with first user
			if (userID == firstUserID || queue.length > 0){
				queue.push(userID);
			} else {
				queueEnd.push(userID);
			}
		}, this);
		l("Queue created - start with " + firstUserID, this.room);
		return queue.concat(queueEnd);
	}

	nextTurn() {
		// move played user to bottom of queue
		this.queue.push(this.queue.shift());
		l("Next turn -> " + this.turn, this.room)	
	}

	get turn() {
		return this.queue[0];
	}

	allDraw(num) {
		// deal 5 cards to each player and update the deck
		Object.keys(rooms[this.room].users).forEach(function(id, index) {
			for(let n = 0; n < num; n++){
				rooms[this.room].users[id].hand.addCardToTop(this.deck.playCard(this.deck.cards[0]));
			}
		}, this);
		l(num + " card(s) dealt to all players.", this.room);
	}

	// set up table for new user (pile, deck, other users)
	getAllCardStacks(socket){
		var data = []
		data.push({title: "pile", id: this.pile.id, display: DISPLAY.pile});
		data.push({title: "deck", id: this.deck.id, display: DISPLAY.deck});

		Object.keys(rooms[this.room].users).forEach(function(id, index) {
			var disp = DISPLAY.alternate;
			var name = rooms[this.room].users[id].name;
			if(id == socket.id){
				disp = DISPLAY.user;
				name = name + " <small>(you)</small>";
			}
			try	{
				data.push({title: name, id: rooms[this.room].users[id].hand.id, display: disp});
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
		Object.keys(rooms[this.room].users).forEach(function(id, index) {
			try {
				rooms[this.room].users[id].hand.refreshDisplay(socket);
			} catch(err) {}; // no need to refresh display if they don't have a hand
		}, this);
	};
}
