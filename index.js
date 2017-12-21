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
var userGen = Moniker.generator([Moniker.adjective, Moniker.noun], {"maxSize": 6})
userGen.maxSize = 6;
userGen.glue = "";

// Libraries
String.prototype.sanitise = function() {
	return this.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
};

String.prototype.striped = function() {
	return this.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").toLowerCase();
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
	if (str.split(" ")[0] == "emit") {
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
		this.game = new MaoGame(this.id);
		l("Room created.", this.id)
		/* Resetting in the constructor causes
		 * bizzare behaviour, don't do it. */
	}

	checkBegin() {
		// Show play button if enough players are ready.
		if(Object.keys(this.users).length > 1 && !this.game.isPlaying)
			io.in(this.id).emit("show begin");
	}

	reset() {
		this.game = new MaoGame(this.id);
		Object.keys(this.users).forEach(function(userID, index) {
			this.users[userID].reset();
			this.users[userID].createHand();
		}, this);
		// Display all hands after resetting all users.
		Object.keys(rooms[this.id].users).forEach(function(userID, index) {
			this.game.displayTable(this.users[userID].socket);
		}, this);
		this.checkBegin();
	}

	removeUser(userID) {
		delete this.users[userID];
		// remove player from queue
		this.game.queue.remove(this.game.queue.indexOf(userID));
		l("Removed user " + userID, this.id)
	}

	findStack(id) {
		if(id == "deck") return this.game.deck;
		if(id == "pile") return this.game.pile;
		return this.users[id].hand;
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
		this.socket.emit("reset display");
		delete this.hand;
		this.spectating = false;
		l("User reset.", this.roomID, this.id);
	}
	joinRoom(){
		// A room has a different table.
		// Reset display upon joining room.
		this.socket.emit("reset display");

		// Join the game if it hasn't started.
		if(!rooms[this.roomID].game.isPlaying){
			l("Game has not started - joining as player.", this.roomID, this.id);
			this.createHand();
			// Display new hand to other players
			this.socket.to(this.roomID).emit("new cardstack", {title: this.name, id: this.hand.id, display: DISPLAY.alternate});
			// Display all hands to this user
			this.socket.emit("new cardstacks", rooms[this.roomID].game.setUpAllCardStacks(this.socket));

			l("Joined room as player.", this.roomID, this.id);
		} else { // Join as spectator
			l("Game has started, joining in spectator mode...", this.roomID, this.id);
			rooms[this.roomID].game.displayTable(this.socket);
			this.spectating = true;
		}
	}
	createHand() {// only playing users should have a CardStack
		this.hand = new CardStack(this.id, this.roomID);
		l("Hand created.", this.roomID, this.id);
	}

	rename(name){
		if(name !== this.name){
			this.name = name;
			this.socket.to(this.roomID).emit("rename user", {id: this.hand.id, name: this.name});
			this.socket.emit("rename user", {id: this.hand.id, name: this.name + " <small>(you)</small>"});
			l("Username set to " + this.name, this.roomID, this.id);
		}
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

	takePenalty(penalty){
		this.moveCard(rooms[this.roomID].game.deck.cards[0], "deck", this.id, true);
		this.emitPenalty(penalty);
	}

	emitPenalty(message){
		io.in(this.roomID).emit("message", {name: this.name, id: this.id, message: message, format: "penalty"});
	}

	emitMessage(message){
		io.in(this.roomID).emit("message", {name: this.name, id: this.id, message: message});
	}

	makeMove(data, animateSelf){
		if(this.isInPlay){
			var origin = data.origin.replace("cardstack-", "");
			// Guess what the destination would be
			if(data.destination === undefined){
				if(origin == "deck") data.destination = this.hand.id;
				else data.destination = "cardstack-pile";
			}
			var destination = data.destination.replace("cardstack-", "");
			// decode card ID, convert to object
			var cardID = cardhashids.decode(data.cardID.replace("card-", ""));
			var movingCard = new Card(Card.getValueFromID(cardID), Card.getSuitFromID(cardID));

			l("Moving " + movingCard.toString() + " from " + origin + " to " + destination, this.roomID, this.id);

			if (origin == destination) {
				// Didn't move, so do nothing.
				l("Origin = destination, no move.")
				return;
			} else if (origin == "deck"){
				if (destination == this.id) {
					// Attempting to draw a card...
					// force taking from the top of the deck
					movingCard = rooms[this.roomID].game.deck.cards[0];
					this.moveCard(movingCard, data.origin, data.destination, animateSelf);

					var penalty = rooms[this.roomID].game.attemptTurn(this.socket);
					if(penalty){
						var _this = this;
						setTimeout(function(){
							_this.takePenalty(penalty);
						}, 500);
					};
					// If they drew a card, they get the card,
					// as well as the penalty card.
					l("Moved from deck to hand.")
				} else {
					// can't draw cards for other players
					l("Can't move from deck to " + destination)
				}
			} else if (origin == this.id) {
				if (this.hand.hasCard(movingCard)){
					if (destination == "pile"){
						// can move from hand to play cards.
						this.moveCard(movingCard, data.origin, data.destination, animateSelf);
						l("Moved from hand to pile.")

						var penalty = rooms[this.roomID].game.attemptTurn(this.socket);
						// undefined is not true or false.
						if(penalty == undefined) penalty = rooms[this.roomID].game.attemptPlay(movingCard, this.socket);
						if(penalty){
							// penalty, move card back
							// penalise for playing out of turn
							var _this = this;
							setTimeout(function(){
								// move card back
								_this.moveCard(movingCard, data.destination, data.origin, true);
								// take penalty card
								_this.takePenalty(penalty);
							}, 500);
							
						}
					} else {
						// can move from hand to other hand for specific rules (IMPLEMENT LATER.)
						// for now, can't do that.
						l("Can't move from hand to " + destination)
					}
				} else {
					// make a big EXCEPTION because how would this happen?
					l("Hand doesn't have that card.")
				}
			} else if (origin == "pile") {
				l("Can't move cards from the pile.")
			} else {
				l("Can't move cards from other hands.");
			}
		}
	}

	moveCard(movingCard, origin, destination, animateSelf){
		var cardID = movingCard.id;
		var displayCard = movingCard.toDisplay(true);
		if(destination == "cardstack-pile")
			displayCard = movingCard.toDisplay();
		var cardInfo = {origin: origin, destination: destination, cardID: cardID, card: displayCard};
		if(animateSelf){
			io.in(this.roomID).emit("display move card", cardInfo);
		} else {
			this.socket.to(this.roomID).emit("display move card", cardInfo);
			// not animated for self
			this.socket.emit("display remove card", {id: origin, cardID: cardID});
			this.socket.emit("display card top", {id: destination, card: movingCard.toDisplay()});
		}
		var originStack = rooms[this.roomID].findStack(origin.replace("cardstack-", ""));
		var destinationStack = rooms[this.roomID].findStack(destination.replace("cardstack-", ""));
		
		originStack.removeCard(movingCard);
		originStack.displayCount();
		destinationStack.cards.unshift(movingCard);
		destinationStack.displayCount();
	}
}

// network handler
io.on('connection', (socket) => {
	l("Connected", undefined, socket.id);

	socket.user = new User(socket, User.generateName());

	socket.on("join room", function(roomID){
		if(socket.roomID){
			l("Still in room!!!", socket.roomID, socket.id);
			leaveRoom(socket); // still in room;
		}
		// Ensure rooms can never have the same ids as hands.
		roomID = "r/" + roomID;
		socket.roomID = roomID;

		l("Joining room...", roomID, socket.id)

		// Leave any previous rooms (DEBUG) - should never happen.
		Object.keys(io.sockets.adapter.sids[socket.id]).filter(item => item!=socket.id).forEach(function(id, index){
			throw ("user was still in room " + id);
			//leaveRoom(socket);
		});

		// Make new room if it doesn't exist.
		if (typeof rooms[roomID] === "undefined") {
			l("Making new room (it doesn't exist)", roomID, socket.id)
			rooms[roomID] = new Room(roomID);
			l("Room made.", roomID, socket.id)
		}
		// Add user to the room
		l("Adding user to room.", roomID, socket.id);
		// Two references to the same object (User)
		rooms[roomID].users[socket.id] = socket.user;
		socket.join(roomID);
		// This method and subsequent methods are applied to both room[roomID].users[socket.id] and socket.user
		socket.user.joinRoom();
		l("User added to room.", roomID, socket.id);

		// Show play button if enough players are ready.
		if(Object.keys(rooms[socket.roomID].users).length > 1 && !rooms[socket.roomID].game.isPlaying)
			io.in(socket.roomID).emit("show begin");
		// Push user count to all clients
		io.in(roomID).emit("user count", Object.keys(rooms[roomID].users).length);
		rooms[roomID].checkBegin();
	});

	// Handle messages from textbox
	socket.on("command", function(data) {
		l("> " + data, socket.roomID, socket.id);
		if(socket.user.isPlayer){
			socket.user.emitMessage(data); // send as message to all regardless of command.
			Command.executeMultiple(data, socket.roomID, socket.id);
		}
	});

	socket.on("move card", function(data){
		socket.user.makeMove(data, false);
	});

	socket.on("play card", function(data){
		socket.user.makeMove(data, true)
	});

	socket.on("sort hand", function(){
		if(socket.user.isInPlay){
			l("Sorting hand.", socket.roomID, socket.id)
			socket.user.hand.sort();
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
			socket.user.rename(name);
		}
	});

	socket.on("leave room", function() {
		l("Leave room...", socket.roomID, socket.id)
		if(socket.roomID !== "undefined"){
			socket.leave(socket.roomID);
			leaveRoom(socket);
			socket.user.reset();
		}
		l("Leave room.", socket.roomID, socket.id);
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

	if(rooms[room] === undefined){
		l("(Room doesn't exist)")
		return;
	}
	if(rooms[room].users[id] === undefined){
		l("(User doesn't exist in room)")
		return;
	}

	if(!rooms[room].users[id].spectating)
		socket.to(room).emit("del cardstack", {id: rooms[room].users[id].hand.id});

	rooms[room].removeUser(id);
	if(Object.keys(rooms[room].users).length === 0){
		delete rooms[room];
		l("Room closed - noone in room, now", room, id)
	} else { // At least one player in room....
		io.in(room).emit("user count", Object.keys(rooms[room].users).length);
		// If now, not enough players to start
		if(rooms[room].game.isPlaying){
			// 'end game' if only 1 player left.
			if(rooms[room].game.queue.length < 2){
				rooms[room].reset();
				l("Game reset, not enough players now.", room, id)
			}
		} else {// Not playing...
			if(Object.keys(rooms[room].users).length === 1){
				io.in(room).emit('hide begin');
				l("Not enough players to begin, now.", room, id);
			}
		}
	}
	delete socket.roomID;
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
		var command = str.striped();

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

	get isHand() {
		try{
			return rooms[this.room].users[this.userID] !== undefined;
		} catch(e){
			return false;
		}
	}

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
	refreshDisplay(socket, hidden) {
		socket.emit("clear cardstack", {id: this.id});
		socket.emit("display cards", {id: this.id, cards: this.toDisplay(hidden)});
		socket.emit("display cardcount", {id: this.id, count: this.length});
		l("Refreshed display.", this.room, this.id)
	}

	displayRemoveCard(card) {
		io.in(this.room).emit("display remove card", {id: this.id, cardID: card.id});
		//l("Removing card in all displays.", this.room, this.id);
	}

	// displays whole hand.
	displayHand() {
		if(this.isHand){
			var socket = rooms[this.room].users[this.userID].socket;
			socket.to(this.room).emit("display cards", {id: this.id, cards: this.toDisplay(true)});
			socket.emit("display cards", {id: this.id, cards: this.toDisplay()});
		} else {
			io.in(this.room).emit("display cards", {id: this.id, cards: this.toDisplay()});
		}
		
		l("Displaying hand.", this.room, this.id);
	}

	toDisplay(hidden) {
		var displayCards = [];
		this.cards.forEach(function(card){
			displayCards.push(card.toDisplay(hidden));
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

	addCardToTop(card){
		this.cards.unshift(card);
		if(this.isHand){
			var socket = rooms[this.room].users[this.userID].socket;
			socket.to(this.room).emit("display card top", {id: this.id, card: card.toDisplay(true)});
			socket.emit("display card top", {id: this.id, card: card.toDisplay()});
		} else {
			io.in(this.room).emit("display card top", {id: this.id, card: card.toDisplay()});
		}
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

	// Only hide initially - cards are never added back to
	// the deck.
	toDisplay(){
		return super.toDisplay(true);
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
	toDisplayString(hidden) {
		if(hidden) return "ᶜʰᵉᵃᵗ<br>ᶜʰᵉᵃᵗ";
		// fix a formatting issue
		var value = this.value;
		var suit = this.suit + "&#xFE0E;";
		if(this.value == "") value = "<br>";
		else if(this.suit == "") suit = "<br>";
		return [value, suit].join("<br>");
	};
	// info used to display a specific card
	toDisplay(hidden) {
		var colour = this.suit.colour;
		if(hidden) colour = "red";
		return {colour: colour, id: this.id, str: this.toDisplayString(hidden)};
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

const PENALTY = {outOfTurn: "Penalty for playing out of turn!", invalidCard: "Penalty for playing out of suit!"};

class MaoGame {
	constructor(roomID) {
		l("Game initialising...", roomID);
		this.roomID = roomID;
		this.deck = new Deck("deck", this.roomID);
		this.pile = new CardStack("pile", this.roomID);
		this.isPlaying = false;
		this.queue = [];
		l("Game initialised.", this.roomID)
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

	get prevTurn() {
		return this.queue[-1];
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
	setUpAllCardStacks(socket){
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
	displayTable(socket){
		socket.emit("new cardstacks", this.setUpAllCardStacks(socket));
		this.deck.refreshDisplay(socket, true); // display back
		this.pile.refreshDisplay(socket);
		Object.keys(rooms[this.roomID].users).forEach(function(id, index) {
			try {
				rooms[this.roomID].users[id].hand.refreshDisplay(socket, true);
			} catch(err) {}; // no need to refresh display if they don't have a hand
		}, this);
	};

	attemptTurn(socket){
		if(socket.id == this.turn){
			i("Playing in turn.", socket.roomID, socket.id);
			// after successful turn, advance it.
			this.nextTurn();
			return;
		} else {
			i("Playing OUT of turn.", socket.roomID, socket.id);
			return PENALTY.outOfTurn;
		}
	}
	// always performed AFTER card move (since penalty is checked AFTER move).
	attemptPlay(card, socket){
		// enforces uno rules
		if(this.pile.cards[1].suit == card.suit || this.pile.cards[1].value == card.value)
			return;
		return PENALTY.invalidCard;
	}
}
var RULES = {};

// much of this is temporary.
class Rule {
	constructor(name, toRun, penaltyText){
		this.name = name;
		this.toRun = toRun;
		this.penaltyText = penaltyText;
	}
}