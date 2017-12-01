// html formatting shit
const SPANEND = "</span>"
const SPANPULSE = "<span class='animated infinite pulse'>"
const SPANBOUNCE = "<span class='animated infinite bounce'>"
const SPANIN = "<span class='animated fadeIn'>"
const SPANDEBUG = "<span class='code'>"
const SPANSUBMITTED = "<span class='submitted'>"
const BREAK = "<br>";

const HANDSTART = 5;

// unused
var typingTimer;

var useJokers = false;

// toString there might be a better way to do this
const SUITS = {"h": "&hearts;", "heart": "&hearts;", "hearts": "&hearts;",
			 "s": "&spades;", "spade": "&spades;", "spades": "&spades;",
			 "d": "&diams;", "diams": "&diams;", "diamond": "&diams;", "diamonds": "&diams;",
			 "c": "&clubs;", "club": "&clubs;", "clubs": "&clubs;", "": ""};
const VALUES = {"ace": "A", "a": "A", "k": "K", "king": "K", "q": "Q", "queen": "Q", 
			  "j": "J", "jack": "J", "10": "10", "ten": "10", "9": "9", "nine": "9", 
			  "8": "8", "eight": "8", "7": "7", "seven": "7", "6": "6", "six": "6", 
			  "5": "5", "five": "5", "4": "4", "four": "4", "3": "3", "three": "3", 
			  "2": "2", "two": "2", "joker": "JOKER", "joker1": "JOKER", "joker2": "JOKER"};

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

const SUITNUM = {0: "H", 1: "D", 2: "C", 3: "S", 4: ""}
const VALUENUM = {1: "A", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10", 11: "J", 12: "Q", 13: "K", 53: "Joker1", 54: "Joker2"}
// Joker is complicated.

class CardStack {
	constructor(id) {
		this.id = id; // used for display
		this.cards = [];
	}

	get isEmpty() {
		if (this.cards.length == 0)
			return true;
	}

	get length() {
		return this.cards.length;
	}

	get displayID() {
		return "cardstack-" + this.id;
	}

	cardAt(index) {
		return this.cards[index];
	}

	// displays whole hand.
	display() {
		var displayID = this.displayID; // 'this' won't work, since it's inside the callback
		this.cards.forEach(function(card){
			card.display(displayID);
		});
	}

	clearDisplay() {
		$("#" + this.displayID + " li").remove();
	}

	shuffle() {
		this.clearDisplay();
		shuffle(this.cards);
		this.display();
	}

	sort() {
		this.clearDisplay();
		this.cards.sort(function(a, b) {
			return a.ID - b.ID
		});
		this.display();
	}

	addCard(card) {
		this.cards.push(card);
		card.display(this.displayID);
	}

	playCard(index) {
		if(this.isEmpty) return false; // no cards to play
		if(index == undefined) index = 0; // just play top of the pile
		var card = this.cards.shift(index);
		$("#" + this.displayID + " #" + card.displayID).remove();
		return card;
	}

	clear() {
		this.cards = [];
		this.clearDisplay();
	}
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
				this.cards.push(new Card(v, s));

		// Deal Jokers, if enabled
		if(useJokers){
			this.cards.push(new Card(53));
			this.cards.push(new Card(54));
		}
		// Display cards
		this.display()
	}
}

class Card {
	constructor(value, suit) {
		if (value == undefined) this.value = Card.convertNumToValue(Math.ceil(Math.random()*13));
		else if (Number.isInteger(value)) this.value = Card.convertNumToValue(value);
		else this.value = value;
		
		if (this.joker) this.suit == ""; // joker has no suit
		else if (suit == undefined) this.suit = Card.convertNumToSuit(Math.floor(Math.random()*4))
		else if (Number.isInteger(suit)) this.suit = Card.convertNumToSuit(suit);
		else this.suit = suit;
	}

	toString() {
		if (this.joker) return "Joker";
		return VALUES[this.value.toLowerCase()] + " " + SUITS[this.suit.toLowerCase()];
	};

	display(location) {
		$("#" + location).append($("<li class='animated fadeIn card " + this.colour + "' id=" + this.displayID + ">").html(this.toString()));
	}

	get colour() {
		if (this.suit == "H" || this.suit == "D")
			return "red";
		return "black";
	}

	get joker(){
		if (this.value == "Joker1" || this.value == "Joker2")
			return true;
		return false;
	}

	get id() {
		// Joker
		if (this.joker) return  Card.convertValueToNum(this.value);
		// normal card
		return (Card.convertSuitToNum(this.suit)*13 + Card.convertValueToNum(this.value));
	};

	get displayID() {
		return "card-" + this.id;
	}

	static convertNumToSuit(num){
		return SUITNUM[num];
	};

	static convertSuitToNum(suit){
		return Number.parseInt(SUITNUM.getKeyByValue(suit));	
	};

	static convertNumToValue(num){
		return VALUENUM[num];
	};

	static convertValueToNum(value){
		return Number.parseInt(VALUENUM.getKeyByValue(value))
	}
}

function parseCard(str) {
	var words = str.sanitise().split(" ");
	var wordsl = words.map(function(x) {
		return x.striped();
	});
	// process words
	for (let e of wordsl.entries()) {
		// if it's a suit
		if (e[1] in SUITS) {
			suit = SUITS[e[1]];
			words[e[0]] = suit;
			// if of
			if (wordsl[e[0]-1] == "of") {
				words[e[0]-1] = "";
				// if value
				if (wordsl[e[0]-2] in VALUES) {
					value = VALUES[wordsl[e[0]-2]];
					words[e[0]-2] = value;
				}
				// if value without of
			} else if (wordsl[e[0]-1] in VALUES) {
				value = VALUES[wordsl[e[0]-1]];
				words[e[0]-1] = value;
			}
		}
	}
	// TODO: convert to card object
	return words.join(" ")
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
	} else if (e.keyCode in [144, 145, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 16, 17, 18, 19, 20, 33, 34, 35, 36, 37, 38, 39, 40, 45]){return}
	else {
		$("#output").html(SPANDEBUG + constructOutput(jInput.val()) + SPANEND);
	}
});


var hands = [];
var deck;
var pile;

function init() {
	jInput.focus();
	hands[0] = new CardStack("hand1");
	deck = new Deck("deck1");
	pile = new CardStack("pile")
}


function executeCommand(str) {
	sstr = str.striped();

	if(sstr == "deal"){
		return "Dealt cards.";
	}
	if(sstr == "begin"){
		deck.makeDeck();
		return "Deck made."
	}
	if(sstr == "pass"){
		dealHand(0, 1);
		return "Card drawn.";
	}
	if(sstr == "deal hand"){
		dealHand(0, 5);
		return "Hand dealt."
	}
	if(sstr == "shuffle deck") {
		deck.shuffle();
		return "Shuffled deck.";
	}

	if(sstr == "the chairwoman has entered" || sstr == "the chair woman has entered") {
		return str + SPANEND + BREAK + SPANPULSE + "All hail the chairwoman!";
	}

	if(sstr == "the chairman has entered" || sstr == "the chair man has entered") {
		return str + SPANEND + BREAK + SPANPULSE + "All hail the chairman!";
	}
	return parseCard(str);
};

// for debugging purposes.
function constructOutput(str){
	// hardcoded rule test, cosmetic onlys
	
	return str;
};

function dealHand(hand, start) {
	for (i = 0; i < start; i++){
		hands[hand].addCard(deck.playCard());
	};
}

const socket = io.connect();

socket.on('connect', function(data) {
	// connect routine
	socket.emit('join');
});


$(document).ready(function() { init(); })

window.onbeforeunload = function() {
	socket.emit('leave');
	socket.disconnect();
}