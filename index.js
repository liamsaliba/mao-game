console.info("MAO server started.");
// function handler : express
const express = require('express');
const app = express();
const http = require('http').Server(app);

// Route handler, sends index.html when root address is hit.
app.use(express.static(__dirname + '/public'));

app.get("/room/", function(req, res){
	res.sendFile(__dirname + "/public/index.html");
});

app.get("/room/:roomID", function(req, res){
	res.sendFile(__dirname + "/public/index.html");
});

const io = require('socket.io')(http);

const PORTNUMBER = 6060;

const { URL } = require('url');

// HTTP server, listen for activity on port
http.listen(PORTNUMBER, function(){
	console.log("Public server started, listening on port " + PORTNUMBER);
	console.log("You may now connect to localhost:" + PORTNUMBER)
	init();
});

// Hashing card IDs
const Hashids = require('hashids');
const userhashids = new Hashids(); //TODO hash user ids
var cardhashids = new Hashids(Math.random()*42);

// Username generator
const Moniker = require("moniker")
const userGen = Moniker.generator([Moniker.adjective, Moniker.noun], {"maxSize": 6})
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




var rooms = {};

// CONSTANTS
const RED = 'red';
const BLACK = 'black';

const DISPLAY = {default: "", back: "back", alternate: "altuser", pile: "pile", deck: "deck", user: "user"};

const DEFAULTSPECMODE = false;

// server start calls
function init() {
	setTimeout(function(){
		//refreshClients();
	}, 1000); // connected clients have time to reconnect before reloading DEBUG ENABLED
	console.log("Server initialised.")
}

function refreshClients() {
	// empty rooms - no-one should be connected.
	rooms = {};
	io.emit("refresh");
	console.log("Refreshed connected clients.")
}

class Room {
	constructor(roomID){
		this.id = roomID;
		this.users = {};
		this.game = new MaoGame(this.id);
		console.log("Room created: '%s'", this.id)
		/* Resetting in the constructor causes
		 * bizzare behaviour, don't do it. */
	}
	// userIDs of all users in room
	get userIDs() {
		return Object.keys(this.users);
	}

	checkBegin() {
		// Show play button if enough players are ready.
		if(this.userIDs.length > 1 && !this.game.isPlaying)
			io.in(this.id).emit("show begin");
	}

	reset() {
		this.game = new MaoGame(this.id);
		// Reset each user / hand
		this.userIDs.forEach(function(userID) {
			this.users[userID].reset();
			this.users[userID].createHand();
		}, this);
		// Display current table to all users (after reset)
		this.userIDs.forEach(function(userID) {
			this.game.displayTable(this.users[userID].socket);
		}, this);
		this.checkBegin();
		console.log("Reset room '%s'", this.id);
	}

	addUser(user){
		this.users[user.id] = user;
		console.log("Added user '%s' to room '%s'", user.id, this.id);
		if(this.game.isPlaying){
			// Spectator

		} else {
			// Player
			console.log("Game in '%s' has already started.", this.id);
			console.log("User '%s' joined room '%s' as spectator.", this.id, this.roomID);
		}
	}

	removeUser(userID) {
		delete this.users[userID];
		// remove player from game queue
		this.game.queue.remove(this.game.queue.indexOf(userID));
		console.log("Removed user '%s' from room '%s'", userID, this.id);
	}

	findStack(id) {
		if(id == "deck") return this.game.deck;
		if(id == "pile") return this.game.pile;
		return this.users[id].hand;
	}
}

class User {
	constructor(socket) {
		this.socket = socket;
		this.name = User.generateName(); // generate a name by default
		this.spectating = DEFAULTSPECMODE;
		console.log("User " + this.name + " created.", this.roomID, this.id);
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
		this.spectating = DEFAULTSPECMODE;
		console.log("User '%s' reset.", this.id);
	}

	createHand() {// only players should have a CardStack
		this.hand = new CardStack(this.id, this.roomID);
		console.log("Hand created.", this.roomID, this.id);
	}

	rename(name){
		if(name !== this.name){
			this.name = name;
			this.socket.to(this.roomID).emit("rename user", {id: this.hand.id, name: this.name});
			this.socket.emit("rename user", {id: this.hand.id, name: this.name + " <small>(you)</small>"});
			console.log("Username set to " + this.name, this.roomID, this.id);
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
		console.log("Taking penalty", this.roomID, this.id)
		this.moveCard(rooms[this.roomID].game.deck.cards[0], "cardstack-deck", "cardstack-" + this.id, true);
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

			console.log("Moving " + movingCard.toString() + " from " + origin + " to " + destination, this.roomID, this.id);

			if (origin == destination) {
				// Didn't move, so do nothing.
				console.log("Origin = destination, no move.")
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
					console.log("Moved from deck to hand.")
				} else {
					// can't draw cards for other players
					console.log("Can't move from deck to " + destination)
				}
			} else if (origin == this.id) {
				if (this.hand.hasCard(movingCard)){
					if (destination == "pile"){
						// can move from hand to play cards.
						this.moveCard(movingCard, data.origin, data.destination, animateSelf);
						console.log("Moved from hand to pile.")

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
						console.log("Can't move from hand to " + destination)
					}
				} else {
					// make a big EXCEPTION because how would this happen?
					console.log("Hand doesn't have that card.")
				}
			} else if (origin == "pile") {
				console.log("Can't move cards from the pile.")
			} else {
				console.log("Can't move cards from other hands.");
			}
		}
	}

	moveCard(movingCard, origin, destination, animateSelf){
		console.log("Moving card " + movingCard + " from " + origin + " to " + destination, this.roomID, this.id)
		var cardID = movingCard.id;
		var cardInfo = {origin: origin, destination: destination, cardID: cardID, card: movingCard.toDisplay(true)};
		// Display actual card if pile
		if(destination == "cardstack-pile")
			cardInfo.card = movingCard.toDisplay();
		// Display to other players
		this.socket.to(this.roomID).emit("display move card", cardInfo);
		// Display actual card if own hand
		if(destination == "cardstack-" + this.id);
			cardInfo.card = movingCard.toDisplay();

		if(animateSelf){ // Display as animation
			this.socket.emit("display move card", cardInfo);
		} else { // Display without animation
			this.socket.emit("display remove card", {id: origin, cardID: cardID});
			this.socket.emit("display card top", {id: destination, card: movingCard.toDisplay()});
		}
		// Actual backend stuff (since above was only display)
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
	console.groupCollapsed("Connecting user");
	console.log("socket id = %s", socket.id);
	var connectionURL = new URL(socket.handshake.headers.referer);
	console.log("URL = %s", connectionURL.href);

	var roomID = "default";
	if(connectionURL.pathname.slice(0,6) === "/room/"){
		roomID = connectionURL.pathname.slice(6);
	}
	console.log("Joining room '%s'", roomID);

	// Make new room if it doesn't exist.
	if (typeof rooms[roomID] === "undefined") {
		console.groupCollapsed("Room '%s' doesn't exist, making new room");
		rooms[roomID] = new Room(roomID);
		console.log("Room created.");
		console.groupEnd();
	}
	socket.emit("reset display"); // TODO: Might not need this.
	// Add user to the room
	console.log("Adding user to room.", roomID, socket.id);
	rooms[roomID].addUser(new User(socket));
	socket.join(roomID); // listening channel

	//socket.user = new User(socket);

	console.groupEnd();
	socket.on("join room", function(roomID){
		
		// Two references to the same object (User)
		
		// This method and subsequent methods are applied to both room[roomID].users[socket.id] and socket.user
		socket.user.joinRoom();
		console.log("User added to room.", roomID, socket.id);

		// Show play button if enough players are ready.
		if(Object.keys(rooms[socket.roomID].users).length > 1 && !rooms[socket.roomID].game.isPlaying)
			io.in(socket.roomID).emit("show begin");
		// Push user count to all clients
		io.in(roomID).emit("user count", Object.keys(rooms[roomID].users).length);
		rooms[roomID].checkBegin();
	});

	// Handle messages from textbox
	socket.on("command", function(data) {
		console.log("> " + data, socket.roomID, socket.id);
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
			console.log("Sorting hand.", socket.roomID, socket.id)
			socket.user.hand.sort();
		}
	});

	socket.on("begin", function(){
		if(socket.roomID !== undefined){
			console.log("Sent begin.", socket.roomID, socket.id)
			if(Object.keys(rooms[socket.roomID].users).length > 1){
				io.in(socket.roomID).emit('hide begin')
				rooms[socket.roomID].game.start(socket.id);
			} else {
				console.log("Not enough players to start game", socket.roomID, socket.id);
			}
		}
	});

	socket.on("set username", function(name) {
		console.log("Setting username to " + name, socket.roomID, socket.id);
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
		console.log("Leave room...", socket.roomID, socket.id)
		if(socket.roomID !== "undefined"){
			socket.leave(socket.roomID);
			leaveRoom(socket);
			socket.user.reset();
		}
		console.log("Leave room.", socket.roomID, socket.id);
		socket.roomID = undefined;
	});


	socket.on("disconnect", function(){
		console.log("Disconnecting...", socket.roomID, socket.id)
		if(socket.roomID !== "undefined")
			leaveRoom(socket);
		console.log("Disconnected", socket.roomID, socket.id);
	});
});

function leaveRoom(socket) {
	var room = socket.roomID;
	var id = socket.id;
	console.log("Leaving room...", room, id);

	if(rooms[room] === undefined){
		console.log("(Room doesn't exist)")
		return;
	}
	if(rooms[room].users[id] === undefined){
		console.log("(User doesn't exist in room)")
		return;
	}

	if(!rooms[room].users[id].spectating)
		socket.to(room).emit("del cardstack", {id: rooms[room].users[id].hand.id});

	rooms[room].removeUser(id);
	if(Object.keys(rooms[room].users).length === 0){
		delete rooms[room];
		console.log("Room closed - noone in room, now", room, id)
	} else { // At least one player in room....
		io.in(room).emit("user count", Object.keys(rooms[room].users).length);
		// If now, not enough players to start
		if(rooms[room].game.isPlaying){
			// 'end game' if only 1 player left.
			if(rooms[room].game.queue.length < 2){
				rooms[room].reset();
				console.log("Game reset, not enough players now.", room, id)
			}
		} else {// Not playing...
			if(Object.keys(rooms[room].users).length === 1){
				io.in(room).emit('hide begin');
				console.log("Not enough players to begin, now.", room, id);
			}
		}
	}
	delete socket.roomID;
	console.log("Left room.", room, id)
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
				console.log("Executing " + name + "...");
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
		console.log("Creating CardStack", this.room, this.id);
		this.cards = [];
		this.clearDisplay();
		console.log("CardStack created", this.room, this.id);
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
		console.log("Sent update display.", this.room, this.id);
	}
	// to an individual user
	refreshDisplay(socket, hidden) {
		socket.emit("clear cardstack", {id: this.id});
		socket.emit("display cards", {id: this.id, cards: this.toDisplay(hidden)});
		socket.emit("display cardcount", {id: this.id, count: this.length});
		console.log("Refreshed display.", this.room, this.id)
	}

	displayRemoveCard(card) {
		io.in(this.room).emit("display remove card", {id: this.id, cardID: card.id});
		//console.log("Removing card in all displays.", this.room, this.id);
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
		
		console.log("Displaying hand.", this.room, this.id);
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
		console.log("Cleared display.", this.room, this.id)
	}

	shuffle() {
		this.cards.shuffle();
		this.updateDisplay();
		console.log("Shuffled.", this.room, this.id)
	}

	sort() {
		this.cards.sort(function(a, b) {
			return a.numID - b.numID
		});
		this.updateDisplay();
		console.log("Sorted.", this.room, this.id)
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
		//console.log("Adding card to top", this.room, this.id);
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
		console.log("Stack emptied", this.room, this.id)
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
		console.log("Deck made.", this.room, this.id);
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
		return {id: this.id, display: hidden ? undefined : this.numID};
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

const PENALTY = {outOfTurn: "Penalty for playing out of turn!", invalidCard: "Penalty for bad play!", timeOut: "Penalty for taking too long!"};

class MaoGame {
	constructor(roomID) {
		console.log("Game initialising...", roomID);
		this.roomID = roomID;
		this.deck = new Deck("deck", this.roomID);
		this.pile = new CardStack("pile", this.roomID);
		this.isPlaying = false;
		this.queue = [];
		console.log("Game initialised.", this.roomID)
	}

	start(firstUserID) {
		console.log("Game starting...", this.roomID);
		this.isPlaying = true;

		// make and shuffle the deck
		this.deck.make();
		console.log("Deck made.", this.roomID)
		this.deck.shuffle();
		console.log("Deck shuffled.", this.roomID);
		// everyone starts with 5 cards [TODO: change by # players]
		this.allDraw(5);
		// one pile card
		this.pile.addCardToTop(this.deck.playCard(this.deck.cards[0]));
		console.log("Starting card dealt.", this.roomID)
		this.queue = this.generateQueue(firstUserID);
		console.log("Game started.", this.roomID);
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
		console.log("Queue created - start with " + firstUserID, this.roomID);
		return queue.concat(queueEnd);
	}

	nextTurn() {
		// move played user to bottom of queue
		this.queue.push(this.queue.shift());
		console.log("Next turn -> " + this.turn, this.roomID);
		var rand = Math.floor(Math.random()*10000);
		console.log("Timer set - " + rand)
		clearTimeout(this.timer);
		this.timer = setTimeout((function(){
			try {
				rooms[this.roomID].users[this.turn].takePenalty(PENALTY.timeOut);
				console.log("Out of time! - " + rand);
				this.nextTurn();
			} catch(err){

			}
		}.bind(this)), 10000);
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
		console.log(num + " card(s) dealt to all players.", this.roomID);
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
			console.log("Playing in turn.", socket.roomID, socket.id);
			// after successful turn, advance it.
			this.nextTurn();
			return;
		} else {
			console.log("Playing OUT of turn.", socket.roomID, socket.id);
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