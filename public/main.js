// html formatting shit
const SPANEND = "</span>"
const SPANPULSE = "<span class='animated infinite pulse'>"
const SPANBOUNCE = "<span class='animated infinite bounce'>"
const SPANIN = "<span class='animated fadeIn'>"
const SPANDEBUG = "<span class='code'>"
const BREAK = "<br>";

// unused
var typingTimer;

var deck = []
var hand = []

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

String.prototype.sanitise = function() {
	return this.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
};

String.prototype.striped = function() {
	return this.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").toLowerCase();
};

Object.prototype.getKeyByValue = function(value) {
	return Object.keys(this).find(key => this[key] === value);
};

function constructOutput(str){
	// hardcoded rule test, cosmetic onlys
	if(str.striped() == "the chairwoman has entered" || str.striped() == "the chair woman has entered") {
		return SPANDEBUG + str + SPANEND + BREAK + SPANPULSE + "All hail the chairwoman!" + SPANEND;
	}

	if(str.striped() == "the chairman has entered" || str.striped() == "the chair man has entered") {
		return SPANDEBUG + str + SPANEND + BREAK + SPANPULSE + "All hail the chairman!" + SPANEND;
	}

	return SPANDEBUG + parseCard(str) + SPANEND;
};

const SUITNUM = {"H": 0, "D": 1, "C": 2, "S": 3, "": 4 };
const VALUENUM = {"JOKER1": 14, "JOKER2": "15", "K": 13, "Q": 12, "J": 11, "10": 10, "9": 9, "8": 8, 
				  "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2, "A": 1 }

class Card {
	constructor(value, suit) {
		if (value == undefined) this.value = Card.convertNumToValue(Math.ceil(Math.random()*13));
		else if (value.isInteger()) this.value = Card.convertNumToValue(value);
		else this.value = value;
		
		if (suit == undefined) this.suit = Card.convertNumToSuit(Math.floor(Math.random()*4))
		else if (suit.isInteger()) this.suit = Card.convertNumToSuit(suit);
		else this.suit = suit;
	}

	toString() {
		return VALUES[this.value.toLowerCase()] + " " + SUITS[this.suit.toLowerCase()];
	};

	get colour() {
		if (Card.convertSuitToNum(this.suit) in [0,1])
			return "red"
		return "black"
	}

	get ID() {
		return Card.convertSuitToNum(this.suit)*13 + Card.convertValueToNum(this.value);
	};	

	static convertNumToSuit(num){
		return SUITNUM.getKeyByValue(num);
	};

	static convertSuitToNum(suit){
		return SUITNUM[suit];
	};

	static convertNumToValue(num){
		return VALUENUM.getKeyByValue(num)
	};

	static convertValueToNum(value){
		return VALUENUM[value];
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

const socket = io.connect();

socket.on('connect', function(data) {
	// connect routine
});

$("#deal-btn").click(function(){
	var deal = new Card()
	hand.push(deal);
	$("#output").html(SPANIN + "card dealt: " + deal + SPANEND);
	$("#hand").append($("<li class='card " + deal.colour + "' id='card-" + deal.id + "'>").html(deal.toString()));
	console.log("deal clicked")
});

$("#play-btn").click(function(){
	if(hand.length == 0){
		$("#output").html(SPANIN + "no cards to be played" + SPANEND);
		return;
	}
	var play = hand.shift();
	$("#output").html(SPANIN + "card played: " + play[0] + SPANEND);
	console.log("play clicked")
});

$("#input").keyup(function(){
	$("#output").html(constructOutput($("#input").val()));
	
});

$("#input").focus();
