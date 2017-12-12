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
}

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
function l(string) {
	console.log(new Date().toLocaleString() + " * " + string)
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

// game object
var rooms = {};

const FACE = {UP: true, DOWN: false}
const RED = 'red';
const BLACK = 'black';

const FORMAT = {DEFAULT: 0, IMPORTANT: 1, DEBUG: 2, ERROR: 3};

const DISPLAY = {default: "", back: "back", alternate: "altuser", pile: "pile", deck: "deck", user: "user"};

// server start calls
function init() {
	setTimeout(function(){
		refreshClients();
	}, 1000); // connected clients have time to reconnect before reloading DEBUG ENABLED
	rooms = {};
	i("Server initialised.")
}

function refreshClients() {
	rooms = {};
	io.emit("refresh");
	l("Refreshed connected clients.")
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
		l("Room '" + id + "' created.")
		this.id = id;
		this.users = {};
		//this.reset();
	}
	reset(){
		l("Room '" + this.id + "' reset.")
		this.users = {};
		this.game = new MaoGame(this.id);
	}
}

class User {
	constructor(socket, room) {
		this.socket = socket;
		this.room = room;
		l("User created id=" + this.id);
		// TODO: add method to make new name
		this.name = this.id.slice(0, 6);

	}
	get id() {
		return this.socket.id;
	}
	resetHand() {
		this.hand = new CardStack(this.id, this.room);
	}

}

// network handler
io.on('connection', (socket) => {
	l("Connected to client id=" + socket.id + "");

	socket.on("join room", function(room){
		socket.join(room)
		l(socket.id + " join room " + room);
		if (typeof rooms[room] === "undefined") {
			rooms[room] = new Room(room);
			rooms[room].reset();
		}
		rooms[room].users[socket.id] = new User(socket, room);

		io.in(room).emit("user count", Object.keys(rooms[room].users).length);

		// join the game if it hasn't started
		if(!rooms[room].game.playing) {
			// add new user to other players
			rooms[room].users[socket.id].resetHand()
			socket.to(room).emit("new cardstack", {title: rooms[room].users[socket.id].name + "'s hand", id: rooms[room].users[socket.id].hand.id, display: DISPLAY.alternate});

			// display all connected players
			socket.emit("new cardstacks", rooms[room].game.getAllCardStacks(socket));

			// handle command
			socket.on("command", function(data) {
				l("Command from id=" + socket.id + " > " + data);
				Command.executeMultiple(data, room, socket.id);
			});

			socket.on("play card", function(data){
				var cardID = data.cardID.replace("card-", "");
				var origin = data.origin.replace("cardstack-", "");
				var destination = data.destination.replace("cardstack-", "");
				movingCard = new Card(Card.getValueFromID(cardID), Card.getSuitFromID(cardID));
				l(socket.id + " moving " + movingCard.toString() + " from " + origin + " to " + destination);

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
			});

			socket.on("disconnect", function(){
				socket.leave(room);
				try {
					io.to(room).emit("del cardstack", {id: rooms[room].users[socket.id].hand.id});
				} catch(err) {} // if the user was a spectator, does not have a hand.
				try {
					delete rooms[room].users[socket.id];
					io.in(room).emit("user count", Object.keys(rooms[room].users).length);
				} catch(err) {} // if user has been deleted already, don't crash.
				
				if(rooms[room].users.length === 0){
					delete rooms[room];
					l("Room '" + room + "' closed.")
				}
				l("Disconnected from client id=" + socket.id + "");
			});
		} else {
			// spectator mode, join next round
			rooms[room].game.displayAll(socket)
		}
	});
});

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
		// TODO: command logging
	}
	// executes single command
	static execute(str, room, userID){
		var words = str.striped().sanitise().split(" ");
		words = Card.parse(words);

		Object.keys(commands).forEach(function(name){
			if(commands[name].isAlias(words[0])){
				i("Executing " + name + "...");
				commands[name].toRun(words.slice(1), room, userID);
			}
		});
	}
}

commands = {reset: new Command(["reset"], function(){
				init();
			}),	refresh: new Command(["refresh"], refreshClients
			),	begin: new Command(["begin", "start"], function(args, room){
				rooms[room].game.start();
			}), sort: new Command(["sort"], function(args, room, userID){
				if (args[0] == "hand"){
					rooms[room].users[userID].hand.sort();
				}
			}), play: new Command(["play", "use"], function(args, room, userID){
				if(args.length == 1 && args[0] instanceof Card){
					if (rooms[room].users[userID].hand.hasCard(args[0])){
						rooms[room].game.pile.addCardToTop(rooms[room].users[userID].hand.playCard(args[0]));
					} else {
						// don't have that card!
						// TODO: Penalties
					}
				}
			}), pass: new Command(["pass"], function(args, userID){
				rooms[room].users[userID].hand.addCardToTop(rooms[room].game.deck.playCard(game.deck.cards[0]));
			}), theme: new Command(["theme"], function(args, room, userID){
				rooms[room].users[userID].socket.emit("theme", args[0]);
			}), users: new Command(["users"], function() {
				// Debug command comparing socket.io's users and my tracked users
				console.log(rooms);
				console.log(Object.keys(io.sockets.sockets));
			})
		};

class CardStack {
	constructor(id, room) {
		this.userID = id;
		this.room = room;
		this.id = "cardstack-" + id; // used for display
		this.cards = [];
		this.clearDisplay();
		l("CardStack '" + this.id + "' created");
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
		l("Updating display '" + this.id + "'");
	}
	// to an individual user
	refreshDisplay(socket) {
		socket.emit("clear cardstack", {id: this.id});
		socket.emit("display cards", {id: this.id, cards: this.toDisplay()});
		socket.emit("display cardcount", {id: this.id, count: this.length});
	}

	displayRemoveCard(card) {
		io.in(this.room).emit("display remove card", {id: this.id, cardID: card.id});
		l("Removing card in '" + this.id + "'");
	}

	// displays whole hand.
	displayHand() {
		io.in(this.room).emit("display cards", {id: this.id, cards: this.toDisplay()});
		l("Displaying hand '" + this.id + "'");
	}

	toDisplay() {
		var displayCards = [];
		this.cards.forEach(function(card){
			displayCards.push(card.toDisplay());
		});
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
		l("Cleared display of " + this.id)
	}

	shuffle() {
		this.cards.shuffle();
		this.updateDisplay();
		l(this.id + " shuffled.")
	}

	sort() {
		this.cards.sort(function(a, b) {
			return a.numID - b.numID
		});
		this.updateDisplay();
		l(this.id + " sorted.")
	}

	addCardToBottom(card) {
		this.cards.push(card);
		io.in(this.room).emit("display card bottom", {id: this.id, card: card.toDisplay()})
		this.displayCount();
		l("Adding card to bottom of " + this.id);
	}

	addCardToTop(card){
		this.cards.unshift(card);
		io.in(this.room).emit("display card top", {id: this.id, card: card.toDisplay()});
		this.displayCount();
		l("Adding card to top of " + this.id);
	}
	// takes cards from pile and adds to stack (aka deal)
	takeCardsBottom(pile, num) {
		for (let i = 0; i < num; i++){
			this.addCardToBottom(pile.playCard());
		}
		return pile;
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
	}
}

var useJokers = false;


class Deck extends CardStack {
	constructor(id, room) {
		super(id, room);
		l("Deck '" + this.id + "' created.");
	};

	make() {
		// clear deck
		this.emptyStack();

		// Deal Standard Cards
		for (let s = 0; s < 4; s++) // loop suits
			for (let v = 1; v < 14; v++) // loop values
				this.cards.push(new Card(VALUES[v], SUITS[s]));

		// Deal Jokers, if enabled
		if(useJokers){
			this.cards.push(new Card(VALUES[0], SUITS[4]));
			this.cards.push(new Card(VALUES[0], SUITS[5]));
		}
		// Display cards
		this.updateDisplay()
		l("Deck '" + this.id + "' made.");
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
		var suit = this.suit + "&#xFE0E";
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
		return "card-" + this.numID;
	}

	static getSuitFromID(id) {
		return SUITS[Math.floor(id/14)];
	}

	static getValueFromID(id) {
		return VALUES[id%14];
	}

	// detects and converts string to Card object
	static parse(words) {
		var wordsl = words;
		var card;
		// process words (enumerate) for each word
		for (let [index, word] of words.entries()) {
			// if it's a suit
			SUITS.forEach(function(suit){
				if (suit.isAlias(word)) {
					if (wordsl[index - 1] == "of") {
						VALUES.forEach(function(value){
							if(value.isAlias(wordsl[index - 2])){
								words[index - 2] = new Card(value, suit);
								words.remove(index);
								words.remove(index - 1);
								return; // "Ace of hearts"
							}
						});
					}
					else {
						VALUES.forEach(function(value){
							if(value.isAlias(wordsl[index - 1])){
								words[index - 1] = new Card(value, suit);
								words.remove(index);
								return; // Ace Hearts
							}
						});
					return;
					}
				}
			});
		};
		return words;
	}
}

class MaoGame {
	constructor(room) {
		console.log("'" + room + "'")
		i("Game initialised");
		this.room = room;
		this.reset();
		this.playing = false;
	}

	reset() {
		this.deck = new Deck("deck", this.room);
		this.pile = new CardStack("pile", this.room);
		Object.keys(rooms[this.room].users).forEach(function(id, index) {
			rooms[this.room].users[id].resetHand();
		}, this);
		i("All cardstacks reset.")
	}

	start() {
		this.playing = true;
		i("Game started");
		io.emit("remove placeholder");
		this.reset();

		// make and shuffle the deck
		this.deck.make();
		this.deck.shuffle();
		// everyone starts with 5 cards [TODO: change by # players]
		this.allDraw(5);
		// one pile card
		this.pile.addCardToTop(this.deck.playCard(this.deck.cards[0]));
		i("Completed game start.");
	}

	allDraw(num) {
		// deal 5 cards to each player and update the deck
		Object.keys(rooms[this.room].users).forEach(function(id, index) {
			for(let n = 0; n < num; n++){
				rooms[this.room].users[id].hand.addCardToTop(this.deck.playCard(this.deck.cards[0]));
			}
		}, this);
	}

	// set up table for new user (pile, deck, other users)
	getAllCardStacks(socket){
		var data = []
		data.push({title: "pile", id: this.pile.id, display: DISPLAY.pile});
		data.push({title: "deck", id: this.deck.id, display: DISPLAY.deck});

		Object.keys(rooms[this.room].users).forEach(function(id, index) {
			var disp = DISPLAY.alternate;
			var name = rooms[this.room].users[id].name + "'s";
			if(id == socket.id){
				disp = DISPLAY.user;
				name = "your"
			}
			try	{
				data.push({title: name + " hand", id: rooms[this.room].users[id].hand.id, display: disp});
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
