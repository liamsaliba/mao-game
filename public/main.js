// html formatting shit
const SPANEND = "</span>"
const SPANPULSE = "<span class='animated infinite pulse'>"
const SPANBOUNCE = "<span class='animated infinite bounce'>"
const SPANIN = "<span class='animated fadeIn'>"
const SPANDEBUG = "<span class='code'>"
const SPANSUBMITTED = "<span class='submitted'>"

const ATTENTIONFMT = SPANEND + SPANPULSE;
const BREAK = "<br>";

const HANDSTART = 5;

// unused
var typingTimer;

var useJokers = false;

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

Array.prototype.remove = function(index) {
	return this.splice(index, 1)[0];
}

Array.prototype.clean = function() {
	for (let e of this.entries()) {
		if (e[1] === ""){
			this.remove(e[0]); // delete ""
		}
	}
}

// shuffles array / deck / hand
function shuffle(array){
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
}

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

	cardAt(index) {
		return this.cards[index];
	}

	updateDisplay() {
		$("#" + this.displayID + " li").remove();
		this.displayHand();
		this.displayCount();
	}

	displayCardTop(isFaceDown) {
		$("#" + this.displayID).prepend(card.toDisplay(isFaceDown));
		this.displayCount();
	}

	displayCardBottom(isFaceDown) {
		$("#" + this.displayID).append(card.toDisplay(isFaceDown));
		this.displayCount();
	}

	// displays whole hand.
	displayHand(isFaceDown) {
		var el = $("#" + this.displayID);
		this.cards.forEach(function(card){
			el.append(card.toDisplay(isFaceDown));
		});
	}

	// TODO: possibly add displaySingleCard ? (append & prepend)

	displayCount() {
		$("#" + this.displayID + "-count").html("(" + this.length + ")");
	}

	clearDisplay() {
		$("#" + this.displayID + " li").remove();
		$("#" + this.displayID + "-count").html("")
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
		this.updateDisplay();
	}

	addCardTop(card){
		this.cards.unshift(card);
		this.updateDisplay();
	}

	removeCard(card){
		card = this.cards.remove(this.getIndex(card));
		$("#" + this.displayID + " #" + card.displayID).remove();
		this.displayCount();
		return card;
	}

	playCard(card) {
		if(this.isEmpty) return false; // no cards to play
		if(card == undefined) card = this.cards[0]; // just play top of the pile
		return this.removeCard(card);
	}

	clear() {
		this.cards = [];
		this.clearDisplay();
	}
}

function deal(from, num) {
	for (i = 0; i < num; i++){
		from.addCardTop(deck.playCard());
	};
	return from;
}


class Deck extends CardStack {
	constructor(id) {
		super(id);
	};

	makeDeck() {
		// clear deck
		this.clear();

		// Deal Standard Cards
		for (var s = 0; s < 4; s++) // loop suits
			for (var v = 1; v < 14; v++) // loop values
				this.cards.push(new Card(values[v], suits[s]));

		// Deal Jokers, if enabled
		if(useJokers){
			this.cards.push(new Card(values[0], suits[4]));
			this.cards.push(new Card(values[0], suits[5]));
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

// red and black card display classes
const RED = 'red';
const BLACK = 'black';

var suits = [new Suit("Hearts", 0, "&hearts;", ["h", "heart", "hearts"], RED),
			 new Suit("Diamonds", 1, "&diams;", ["d", "diams", "diamond", "diamonds"], RED),
			 new Suit("Clubs", 2, "&clubs;", ["c", "club", "clubs"], BLACK),
			 new Suit("Spades", 3, "&spades;", ["s", "spade", "spades"], BLACK),
			 new Suit("Red", 4, "", ["red"], RED), new Suit("Black", 5, "", ["black"], BLACK)
			];

var values = [new Value("Joker", 0, "JKR", ["joker"]), new Value("Ace", 1, "A", ["ace", "a", "1"]), new Value("2", 2, "2", ["two", "2"]),
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

const jInput = $("#input")

// submit command
jInput.keydown(function(e) {
	// Enter key pressed
	
});

// live input
jInput.keyup(function(e){
	if (e.keyCode == 13) {
		e.preventDefault();
		$("#output").html(SPANSUBMITTED + executeCommand(jInput.val())+ SPANEND);
		jInput.val("");
	} else if (e.keyCode in []){return}
	else {
		$("#output").html(SPANDEBUG + constructOutput(jInput.val()) + SPANEND);
	}
});


var hands = [];
var deck;
var pile;

function init() {
	jInput.focus();
	reset();
}

function reset() {
	// TODO: make objects
	defaults();
}

function defaults() {
	hands[0] = new CardStack("hand1");
	deck = new Deck("deck1");
	pile = new CardStack("pile")
}

// executes comma separated commands 
function executeCommand(str) {
	var output = [];
	str.split(", ").forEach(function(piece){
		output.push(executePiece(piece));
	});
	return output.join(BREAK);
};



class Command {
	constructor(aliases, toRun){
		this.aliases = aliases;
		this.toRun = toRun;
	}
}




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
	// process words (enumerate)
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

	// removes blank spaces
	words.clean();

	// play logic
	if (words.length == 3) {
		if (wordsl[0] == "play" && card !== undefined){
			return attemptPlay(card);
		}
	}
	
	// TODO: convert to card object
	return words.join(" ")
}

// test
function attemptPlay(card) {
	var topCard = pile.cardAt(0);

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

function startGame() {
	$("#input").removeAttr('placeholder');

	reset(); 

	deck.makeDeck();
	deck.shuffle();
	hands[0] = deal(hands[0], 5);
	pile = deal(pile, 1);
}

// for debugging purposes.
function constructOutput(str){
	// hardcoded rule test, cosmetic onlys
	
	return str;
};



const socket = io.connect();
// connect routine

socket.on("connect", function() {
	socket.emit('join');
	$("#connection-info").addClass("connected");
})

socket.on("disconnect", function() {
	$("#connection-info").removeClass("connected");
});


$(document).ready(function() { init(); })

window.onbeforeunload = function() {
	socket.emit('leave');
	socket.disconnect();
}

socket.on("command", function(data) {
	executeCommand(data.cmd);
})