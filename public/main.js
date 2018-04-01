var commandHistory = ["begin"]
var blackTheme = (getCookie("theme") == "true");
setTheme();

// gets key from cookie
function getCookie(name) {
  var value = "; " + document.cookie;
  var parts = value.split("; " + name + "=");
  if (parts.length == 2) return parts.pop().split(";").shift();
}

const jOverlay = $("#overlay");
const eInput = document.getElementById("input");

const SEL_UNSELECTED = -1;
var inputSelectIndex = SEL_UNSELECTED;

const INPUTMODES = {CHAT: 0, ROOM: 1, NAME: 2}
var inputMode = INPUTMODES.CHAT;

resetInput();
eInput.addEventListener("keydown", function(event){
	if (event.defaultPrevented) {
    	return; // Do nothing if the event was already processed
  	}
  	switch (event.key){
  		case "Escape":
  			resetInput();
  			break;
		case "ArrowUp":
			if (inputMode == INPUTMODES.CHAT){
				if(inputSelectIndex < commandHistory.length-1){
					inputSelectIndex++;
					eInput.value = commandHistory[inputSelectIndex];
				}
			}
			break;
		case "ArrowDown":
			if (inputMode == INPUTMODES.CHAT){
				// Move command selection down (unless we're at the bottom)
				inputSelectIndex--;
				if(inputSelectIndex > SEL_UNSELECTED){
					eInput.value = commandHistory[inputSelectIndex];
				} else {
					// Nothing selected, so reset (in chat mode, so soft reset)
					inputSelectIndex = SEL_UNSELECTED;
					eInput.value = "";
				}
			}
			break;
		case "Enter":
			switch (inputMode){
				case INPUTMODES.CHAT:
					if(eInput.value !== ""){
						// add command to history
						commandHistory.unshift(eInput.value);
						socket.emit("command", commandHistory[0]);
						eInput.value = "";
					}
					break;
				case INPUTMODES.ROOM:
					socket.emit("leave room");
					room = eInput.value;
					window.history.pushState(room, "mao - " + room, "/room/" + room);
					console.log("attempted to join room, " + room);
					socket.emit("join room", room);
					break;
				case INPUTMODES.NAME:
					socket.emit("set username", eInput.value);
					break;
			}
			resetInput();
			break;
		default:
			return;
  	}

  	// Cancel the default action to avoid it being handled twice
  	event.preventDefault();
}, true); // useCapture

function resetInput() {
	inputSelectIndex = SEL_UNSELECTED;
	inputMode = INPUTMODES.CHAT;
	eInput.value = "";
	eInput.placeholder = "chat";
	jOverlay.finish().fadeOut("fast");
	eInput.focus();
}



// DEPRECATED
function output2(str, format) {
	if(format == FORMAT.IMPORTANT)
		$("#output").append("<li class='animated infinite pulse'>" + str + "</li>");
	else if(format == FORMAT.DEBUG)
		$("#output").append("<li class='code'>" + str + "</li>");
	else if(format == FORMAT.ERROR)
		$("#output").html("<li class='animated bounce error'" + str + "</li>")
	else
		$("#output").html("<li>" + str + "</li>");
}

function output(data){
	if(data.format === undefined) data.format = "";
	else if (data.format === "penalty"){
		// self gets a penalty.
		if(socket.id == data.id){
		//	$(body)
		//	$(body).css({"background": "red"}).delay
		}
	}

	$("#messages").append("<li>" + data.name + " <span class='message-body " + data.format + "'>" + data.message + "</span></li>");
	$("#cardstack-" + data.id + " .cardstack-message").finish().fadeIn("fast").html("<span class='message-body " + data.format + "'>" + data.message + "</span>").delay(3000).fadeOut("fast");
}

function init() {
	eInput.focus();
}

$("main").click(function(){
	eInput.focus();
	$("nav").slideUp();
});

$("#btn-settings").click(function(){
	eInput.focus();
	$("nav").slideDown();
});

$("#btn-close-settings").click(function(){
	eInput.focus();
	$("nav").slideUp();
});

$("#btn-theme").click(function(){
	eInput.focus();
	blackTheme = !blackTheme;
	setTheme();
});

$("#btn-room").click(function(){
	eInput.focus();
	eInput.placeholder = "enter room...";
	inputMode = INPUTMODES.room;
	jOverlay.finish().fadeIn();
});

$("#btn-username").click(function(){
	eInput.focus();
	eInput.placeholder = "enter username...";
	inputMode = INPUTMODES.name;
	jOverlay.finish().fadeIn();
});

$("#btn-cancel").click(resetInput);

$("#btn-begin").click(function(){
	eInput.focus();
	$(this).finish().fadeOut("fast");
	socket.emit("begin");
})

var chatShown = false;
$("#btn-showchat").click(function(){
	if(chatShown){
		$("#btn-showchat i").removeClass("fa-angle-down").addClass("fa-angle-up");
		$("#output").finish().fadeOut();

	} else {
		$("#btn-showchat i").removeClass("fa-angle-up").addClass("fa-angle-down");
		$("#output").finish().fadeIn();
	}
	chatShown = !chatShown;
})

function updateUserCount(count){
	if(count === undefined)
		$("#info-online-count").html();
	else
		$("#info-online-count").html(count + " players in '" + room + "'");
};

var id;
const socket = io.connect("/");

// get room by URL
var room = "";
var cardstacks = [];
if(window.location.pathname.slice(0, 6) == "/room/")
	room = window.location.pathname.slice(6);

// socket.io debugging
//localStorage.debug = "*";

socket.on("connect", function() {
	$("#connection-info").addClass("connected");
	socket.emit("join room", room);
	try{ // Mobile theme colour
		$('meta[name=theme-color]').attr('content', '#266d26')
	} catch(e){};
	$("#info-online").html("connected");
	$("#info-id").html("id=" + socket.id);
});
// delete all cardstacks and remove begin
function resetDisplay() {
	$(".cardstack-container").remove();
	$("#btn-begin").finish().fadeOut("fast");
	cardstacks = [];
}

socket.on("reconnect", function(){
	console.log("reconnected!");
	socket.disconnect();
	location.reload(true);
})

socket.on("disconnect", function() {
	$("#connection-info").removeClass("connected");
	$('meta[name=theme-color').attr('content', '#6d2626')
	$("#info-online").html("disconnected");
	updateUserCount();
});

socket.on("message", output);

socket.on("output", function(data) {
	output(data.str, data.format);
});

socket.on("refresh", function() {
	location.reload(true);
});

socket.on("user count", function(count) {
	updateUserCount(count);
});

socket.on("show begin", function(){
	$("#btn-begin").finish().fadeIn("fast");
})

socket.on("hide begin", function(){
	$("#btn-begin").finish().fadeOut("fast");
})

socket.on("clear table", function() {
	$(".cardstack-container").remove();
});

socket.on("reset display", resetDisplay);

$(document).ready(function() { init(); })

// exit warning DEBUG DISABLED
//window.onbeforeunload = function() {return true;};

window.onunload = function() {
	socket.disconnect();
};

socket.on("new cardstack", function(user){
	newCardStack(user);
	setTable();
});

socket.on("new cardstacks", function(data) {
	data.forEach(function(user){
		newCardStack(user);
	});
	setTable();
});
// list of ids by turn order
function newCardStack(data) {
	var drop = "";
	if(data.display == "user" || data.display == "pile")
		drop = ' ondrop="dropCard(event)" ondragover="allowDrop(event)"';
	var stack = $("#table").append('<div class="cardstack-container ' + data.display + '" id="' + data.id + '"' + drop + '><div class="cardstack-box"><div class="cardstack"></div></div><div class="cardstack-head"><h2 class="cardstack-title">' + data.title + '</h2><small class="cardstack-count"></small></div><div class="cardstack-message"></div></div>')
	if(data.display == "user"){
		$("#" + data.id + " .cardstack-head").click(function(){
			socket.emit("sort hand");
		});
	}
	if(data.display == "user" || data.display == "altuser"){
		cardstacks.push(data.id);
	}
}

function setTable(){
	var userIndex = -1;
	cardstacks.forEach(function(id, index){
		el = $("#" + id)
		if(userIndex > -1){
			if(index == userIndex+1)
				el.detach().prependTo("#altusers")
			else {
				el.detach().insertAfter("#altusers .cardstack-container:eq(" + (index - userIndex - 2) + ")");
			}
		} else if(id.replace("cardstack-", "") == socket.id) {
			userIndex = index;
		} else {
			el.detach().appendTo("#altusers");
		}
	});
}


socket.on("del cardstack", function(data){
	cardstacks.splice(cardstacks.indexOf(data.id), 1);
	$("#" + data.id).remove();
	setTable();
});

socket.on("display cardcount", function(data) {
	if(data.count === undefined || data.count == 0)
		$("#" + data.id + " .cardstack-count").html("");
	else
		$("#" + data.id + " .cardstack-count").html("(" + data.count + ")");
})

socket.on("clear cardstack", function(data) {
	$("#" + data.id + " .cardstack li").remove();
})

socket.on("rename user", function(data){
	$("#" + data.id + " .cardstack-title").html(data.name);
})


socket.on("display move card", function(data){
	var $target = $("#" + data.destination);
	var $card = $("#" + data.origin + " #" + data.cardID);

	var xT = $target.offset().left + $target.width() / 2 - $card.width() / 2;
	var yT = $target.offset().top + $target.height() / 2 - $card.height() / 2;

	$card.addClass('animated');
	var xE = $card.offset().left;
	var yE = $card.offset().top;
	// Initial conditions
	$card.detach().appendTo("#animation").css({"left": xE, "top": yE, "opacity": 1});
	setTimeout(function(){
		$card.css({"left": xT, "top": yT, "opacity": 0});
	}, 50)

	$("#" + data.destination + " .cardstack").prepend(displayCard(data.card, data.destination));
	var $card2 = $("#" + data.destination + " #" + data.cardID);
	$card2.hide();

	// when animation has completed
	// transitionend does not fire when tab is
	// out of focus.
	var hasFired = false;
	$card.one("webkitTransitionEnd otransitionend oTransitionEnd msTransitionEnd transitionend", function(e) {
		$card.remove();
		$card2.fadeIn("fast");
		hasFired = true;
	});

	setTimeout(function(){
		if(!hasFired){
			$card.remove();
			$card2.fadeIn("fast");
		}
	}, 1000);
})

socket.on("display remove card", function(data) {
	$("#" + data.id + " #" + data.cardID).remove();
});

socket.on("display card top", function(data) {
	$("#" + data.id + " .cardstack").prepend(displayCard(data.card, data.id));
});

socket.on("display card bottom", function(data) {
	$("#" + data.id + " .cardstack").append(displayCard(data.card, data.id));
});

socket.on("display cards", function(data) {
	for (index in data.cards){
		$("#" + data.id + " .cardstack").append(displayCard(data.cards[index], data.id));
	}
});

function displayCard(card, id) {
	var r = (Math.random()*8)-4;
	var x = (Math.random()*4)-2;
	var y = (Math.random()*4)-2;
	var transform = "transform: rotate("+r+"deg) translate(" + x + "px, " + y + "px);";
	var background = card.display === undefined ? "" : " background-image: url(/cards/" + card.display + ".png);";
	var draggable = false;
	var onClick = "";
	if ($("#" + id).hasClass("user") || $("#" + id).hasClass("deck")) {
		draggable = true;
		onClick = "' onclick='clickCard(event)";
	}
	return "<li class='card' id='" + card.id + onClick + "' draggable=" + draggable + " ondragstart='dragCard(event)' style='" + transform + background + "'></li>";
}
// Fixes touch screen drags (I think)
window.addEventListener('touchmove', function() {})

function clickCard(event){
	socket.emit("play card", {cardID: event.target.id, origin: event.path[3].id});
	eInput.focus();
}

///// Drag and drop functionality
function dragCard(event){
	// sets the data that is to be dragged, by the ID of the element.
	event.dataTransfer.setData("text\\plain", event.target.id + ";" + event.path[3].id);
	event.dataTransfer.dropEffect = "move";
	setTimeout(function() {event.target.style.opacity = .01}, 10);
	//console.log("dragging")
}

// Displays drop cursor
function allowDrop(event) {
	event.preventDefault(); // data/elements cannot be dropped in other elements by default
	// Set the dropEffect to move
 	event.dataTransfer.dropEffect = "move"
 	//console.log("allow drop")
}

// Reset opacity on cancel / mistake
document.addEventListener("dragend", function(event){
	event.target.style.opacity = 1;
	//console.log("dragend")
})

function dropCard(event){
	event.preventDefault(); // open as link on drop by default
	var data = event.dataTransfer.getData("text\\plain").split(";") // the ID of the dropped element
	if(data.length != 2) return false; // not a card

	var destination; // drag to container
	if(event.target.id == "") destination = event.path[2].id;
	else destination = event.path[3].id; // drag to card in container

	socket.emit("move card", {cardID: data[0], origin: data[1], destination: destination});
	// server handles the rest.
	//console.log("dropped")
	eInput.focus();
}




function setTheme() {
	if(blackTheme){
		$('link[rel=stylesheet][href~="/dark.css"]').removeAttr('disabled');
		$("#btn-theme").html("Light Theme")
	} else {
		$('link[rel=stylesheet][href~="/dark.css"]').attr('disabled', 'disabled');
		$("#btn-theme").html("Dark Theme")
	}
	document.cookie = ("theme=" + blackTheme)
}

function fadeIn(el){
	el.classList.add("fade");
	el.classList.replace("hide", "show");
}

function fadeOut(el){
	el.classList.add("fade");
	el.classList.replace("show", "hide");
}