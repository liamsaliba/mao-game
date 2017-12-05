l("MAO server started.");
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

// game object
var game;
var users = {};

// server start calls
function init() {
	setTimeout(function(){
		refreshClients();
	}, 300); // connected clients have time to reconnect before reloading
	game = new MaoGame();
	("Server initialised.")
}

function refreshClients() {
	users = {};
	io.emit("refresh");
	l("Refreshed connected clients.")
}

// console input handler
var stdin = process.openStdin();
stdin.addListener("data", function(d) {
	str = d.toString().trim().toLowerCase();
	c(str);
	if (str.split(" ")[0] == "broadcast"){
		io.emit("broadcast", str.slice(1));
		l("Broadcasting > " + str.slice(1));
	}
	else {
		io.emit(str);
		l("Emitting > " + str);
	}
});


class User {
	constructor(socket) {
		this.socket = socket;
		l("User created id=" + this.id);
	}
	get id() {
		return this.socket.id;
	}
	resetHand() {
		this.hand = new CardStack("hand-" + this.id);
	}
}

// network handler
io.on('connection', (socket) => {
	l("Connected to client id=" + socket.id + "");
	users[socket.id] = new User(socket);
	io.emit("user count", Object.keys(users).length);

	// handle command
	socket.on("command", function(data) {
		l("Command from id=" + socket.id + " > " + data);
	});

	socket.on("disconnect", function(){
		delete users[socket.id];
		l("Disconnected from client id=" + socket.id + "");
	})
});



// handle commands by players
class Command {
	constructor(aliases, toRun){
		this.aliases = aliases;
		this.toRun = toRun;
	}
}

// executes comma separated commands 
function executeCommand(str) {
	var output = [];
	str.split(", ").forEach(function(piece){
		output.push(executePiece(piece));
	});
	return output.join(BREAK);
};

// TODO: move to command objects
function executePiece(str) {
	sstr = str.striped();

	if(sstr == "reset"){
		reset();
		return "Reset the game.";
	}

	if(sstr == "begin"){
		startGame();

		return SPANEND + SPANPULSE + "Here begins the game."
	}
	if(sstr == "pass"){
		hands[0] = deal(hands[0], 1);
		return "Card drawn by YOU.";
	}
	if(sstr == "deal hand"){
		hands[0] = deal(hands[0], 5);
		return "Hand dealt to YOU."
	}
	if(sstr == "shuffle deck") {
		deck.shuffle();
		return "Deck shuffled.";
	}
	if(sstr == "sort deck") {
		deck.sort();
		return "Deck sorted.";
	}
	if(sstr == "sort hand") {
		hands[0].sort();
		return "Sorted YOUR hand."
	}

	if(sstr == "the chairwoman has entered" || sstr == "the chair woman has entered") {
		return str + SPANEND + BREAK + SPANPULSE + "All hail the chairwoman!";
	}

	if(sstr == "the chairman has entered" || sstr == "the chair man has entered") {
		return str + SPANEND + BREAK + SPANPULSE + "All hail the chairman!";
	}
	return parseCard(str);
}

function parseCard(str) {
	var words = str.sanitise().split(" ");
	var wordsl = words.map(function(x) {
		return x.striped();
	});
	var card;
	// process words (enumerate) for each word
	for (let e of wordsl.entries()) {
		// if it's a suit
		if (e[1] in suits) {
			suit = SUITS[e[1]];
			words[e[0]] = suit;
			// if of
			if (wordsl[e[0]-1] == "of") {
				words[e[0]-1] = "";
				// if value
				if (wordsl[e[0]-2] in VALUES) {
					value = VALUES[wordsl[e[0]-2]];
					words[e[0]-2] = value;

					card = new Card(value, e[1].charAt(0))					
				}
				// if value without of
			} else if (wordsl[e[0]-1] in VALUES) {
				value = VALUES[wordsl[e[0]-1]];
				words[e[0]-1] = value;

				card = new Card(value, e[1].charAt(0))
			}
		}
	}

	words.removeBlanks();

	// play logic
	if (words.length == 3) {
		if (wordsl[0] == "play" && card !== undefined){
			return attemptPlay(card);
		}
	}
	
	// TODO: convert to card object
	return words.join(" ")
}

// TODO: migrate suit to SUITS etc
// TODO: make event driven / exception driven messages to send to client
function attemptPlay(card) {
	var topCard = pile.cards[0];

	if (hands[0].hasCard(card)){
		if(card.suit == topCard.suit){
			pile.addCardTop(hands[0].playCard(hands[0].getIndex(card)));
			return "Played " + card;
		} else if(card.value == topCard.value){
			pile.addCardTop(hands[0].playCard(hands[0].getIndex(card)));
			return "Played " + card;
		}
		hands[0] = deal(hands[0], 1);
		return ATTENTIONFMT + "Penalty for playing an invalid card!";
	} return "You don't have " + card;
}


// for debugging purposes. -- handle live textbox input
function constructOutput(str){
	// hardcoded rule test, cosmetic onlys
	return str;
};

// handle the actual game



class CardStack {
	constructor(id) {
		this.id = id; // used for display
		this.cards = [];
		this.clearDisplay();
	}

	get isEmpty() {
		return this.cards.length == 0;
	}

	get length() {
		return this.cards.length;
	}

	get displayID() {
		return "cardstack-" + this.id;
	}

	getIndex(card) {
		return this.cards.findIndex(card2 => card2.id === card.id);
	};

	hasCard(card) {
		return this.getIndex(card) !== undefined;
	}

	updateDisplay() {
		//$("#" + this.displayID + " li").remove();
		//TODO: pass to client
		this.displayHand();
		this.displayCount();
	}

	displayCardTop(isFaceDown) {
		//$("#" + this.displayID).prepend(card.toDisplay(isFaceDown));
		// TODO: pass to client
		this.displayCount();
	}

	displayCardBottom(isFaceDown) {
		//$("#" + this.displayID).append(card.toDisplay(isFaceDown));
		// TODO: pass to client
		this.displayCount();
	}

	displayRemoveCard(card) {
		//$("#" + this.displayID + " #" + card.displayID).remove();
	}

	// displays whole hand.
	displayHand(isFaceDown) {
		/*
		var el = $("#" + this.displayID);
		this.cards.forEach(function(card){
			el.append(card.toDisplay(isFaceDown));
		}); */
		// TODO: pass to client
	}
	// card count
	displayCount() {
		//$("#" + this.displayID + "-count").html("(" + this.length + ")");
		// TODO: pass to client
	}

	clearDisplay() {
		//$("#" + this.displayID + " li").remove();
		//$("#" + this.displayID + "-count").html("")
		// TODO: pass to client
	}

	shuffle() {
		shuffle(this.cards);
		this.updateDisplay();
	}

	sort() {
		this.cards.sort(function(a, b) {
			return a.id - b.id
		});
		this.updateDisplay();
	}

	addCardBottom(card) {
		this.cards.push(card);
		this.displayCardBottom();
	}

	addCardTop(card){
		this.cards.unshift(card);
		this.displayCardBottom();
	}
	// takes cards from pile and adds to stack (aka deal)
	takeCards(pile, num) {
		for (i = 0; i < num; i++){
			this.addCardTop(pile.playCard());
		}
		return pile;
	}

	removeCard(card){
		card = this.cards.remove(this.getIndex(card));
		this.displayRemoveCard(card);
		this.displayCount();
		return card;
	}

	playCard(card) {
		if(this.isEmpty) return false; // no cards to play
		if(card == undefined) card = this.cards[0]; // just play top of the pile
		return this.removeCard(card);
	}

	emptyStack() {
		this.cards = [];
		this.clearDisplay();
	}
}

var useJokers = false;

class Deck extends CardStack {
	constructor(id) {
		super(id);
	};

	make() {
		// clear deck
		this.emptyStack();

		// Deal Standard Cards
		for (var s = 0; s < 4; s++) // loop suits
			for (var v = 1; v < 14; v++) // loop values
				this.cards.push(new Card(VALUES[v], SUITS[s]));

		// Deal Jokers, if enabled
		if(useJokers){
			this.cards.push(new Card(VALUES[0], SUITS[4]));
			this.cards.push(new Card(VALUES[0], SUITS[5]));
		}
		// Display cards
		this.updateDisplay()
	}

	// displays whole hand.
	displayHand(isFaceDown) {
		super.displayHand(true);
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
		return (str in this.aliases)
	}
}

class Suit extends Value {
	constructor(name, id, string, aliases, colour) {
		super(name, id, string, aliases)
		this.colour = colour;
	}
}

const RED = 'red';
const BLACK = 'black';

var SUITS = [new Suit("Hearts", 0, "&hearts;", ["h", "heart", "hearts"], RED),
			 new Suit("Diamonds", 1, "&diams;", ["d", "diams", "diamond", "diamonds"], RED),
			 new Suit("Clubs", 2, "&clubs;", ["c", "club", "clubs"], BLACK),
			 new Suit("Spades", 3, "&spades;", ["s", "spade", "spades"], BLACK),
			 new Suit("Red", 4, "", ["red"], RED), new Suit("Black", 5, "", ["black"], BLACK)
			];

var VALUES = [new Value("Joker", 0, "JKR", ["joker"]), new Value("Ace", 1, "A", ["ace", "a", "1"]), new Value("2", 2, "2", ["two", "2"]),
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
		console.log(this.value + " " + this.suit);
	}

	toString() {
		return [this.value, this.suit].join(" ");
	};

	toDisplay(isFaceDown) {
		var displayClass;
		if(isFaceDown) displayClass = "back";
		else displayClass = "";
		///TODO: push to client - possibly.
		return "<li class='animated flipInY card " + this.suit.colour + " " + displayClass + "' id=" + this.displayID + ">" + this.toString() + "</li>";
	}

	get id() {
		// normal card
		return ((this.suit.id)*13 + (this.value.id));
	};

	get displayID() {
		return "card-" + this.id;
	}
}





class MaoGame {
	constructor() {
		l("Game initialised");
		this.reset();
	}
	// TODO: move hands to users
	reset() {
		this.deck = new Deck("deck");
		this.pile = new CardStack("pile");
		for(var i = 0; i < Object.keys(users).length; i++){
			users[Object.keys(users)[i]].resetHand();
		};
	}

	start() {
		io.emit("remove placeholder");
		this.reset();

		// make and shuffle the deck
		this.deck.make();
		this.deck.shuffle();

		// deal 5 cards to each player and update the deck
		for(var i = 0; i < Object.keys(users).length; i++){
			this.deck = users[Object.keys(users)[i]].hand.takeCards(this.deck, 5);
		};
	}
}
