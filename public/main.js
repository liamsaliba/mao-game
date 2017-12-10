var commandHistory = []

const jInput = $("#input")

if(getCookie("theme") !== "")
	setTheme(getCookie("theme"));

function getCookie(cname) {
    var name = cname + "=";
    var ca = document.cookie.split(';');
    for(var i=0; i<ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0)==' ') c = c.substring(1);
        if (c.indexOf(name) == 0) return c.substring(name.length,c.length);
    }
    return "";
}

jInput.keyup(function(e){
	if (e.keyCode == 13) {
		e.preventDefault();
		if(jInput.val() !== ""){
			commandHistory.unshift(jInput.val()); // add command to history
			socket.emit("command", commandHistory[0]);
			jInput.val("");
		}
	} else if (e.keyCode in []){return} // cancel if ctrl, shift, etc
	else {
		//constructOutput(jInput.val()); // live output
	}
});

const FORMAT = {DEFAULT: 0, IMPORTANT: 1, DEBUG: 2, ERROR: 3}

function output(str, format) {
	if(format == FORMAT.IMPORTANT)
		$("#output").append("<li class='animated infinite pulse'>" + str + "</li>");
	else if(format == FORMAT.DEBUG)
		$("#output").append("<li class='code'>" + str + "</li>");
	else if(format == FORMAT.ERROR)
		$("#output").html("<li class='animated bounce error'" + str + "</li>")
	else
		$("#output").html("<li>" + str + "</li>");
}

function init() {
	jInput.focus();
}

function updateUserCount(count){
	if(count === undefined)
		$("#info-online-count").html();
	else
		$("#info-online-count").html(count + " online");
};

var id;
const socket = io.connect();
// connect routine
//localStorage.debug = "*";

socket.on("connect", function() {
	$("#connection-info").addClass("connected");
	$("#info-online").html("connected");
	$(".cardstack-container").remove(); // resets display
	id = socket.id;
});

socket.on("reconnect", function(){
	console.log("reconnected!");
	// TODO: handle continue
})

socket.on("disconnect", function() {
	$("#connection-info").removeClass("connected");
	$("#info-online").html("disconnected");
	updateUserCount();
});
// could make this serverside but meh
socket.on("theme", setTheme)

socket.on("broadcast", function(data) {
	output(data, FORMAT.IMPORTANT)
});

socket.on("output", function(data) {
	output(data.str, data.format);
});

socket.on("refresh", function() {
	location.reload(true);
});

socket.on("user count", function(count) {
	updateUserCount(count);
});

socket.on("remove placeholder", function(){
	$("#input").attr('placeholder', 'enter command...');
});

socket.on("clear table", function() {
	$("#table *").remove();
});

socket.on("id", function(data) {
	id = data.id;
	$("#info-id").html("id=" + id);
})

$(document).ready(function() { init(); })

// exit warning DEBUG DISABLED
//window.onbeforeunload = function() {return true;};

window.onunload = function() {
	socket.emit('leave');
	socket.disconnect();
};

socket.on("new cardstack", newCardStack);

socket.on("new cardstacks", function(data) {
	data.forEach(function(user){
		newCardStack(user);
	});
});

function newCardStack(data) {
	$("#table").append('<div class="cardstack-container" id="' + data.id + '" ondrop="dropCard(event)" ondragover="allowDrop(event)"><h2 class="cardstack-title">' + data.title + '</h2><small class="cardstack-count"></small><div class="cardstack"></div>');
}


socket.on("del cardstack", function(data){
	$("#cardstack-" + data.id).remove();
});

socket.on("display cardcount", function(data) {
	if(data.count === undefined)
		$("#" + data.id + " .cardstack-count").html("");
	else
		$("#" + data.id + " .cardstack-count").html("(" + data.count + " cards)");
})

socket.on("clear cardstack", function(data) {
	$("#" + data.id + " .cardstack li").remove();
})




socket.on("display remove card", function(data) {
	$("#" + data.id + " #" + data.cardID).remove();
});

socket.on("display card top", function(data) {
	$("#" + data.id + " .cardstack").prepend(displayCard(data.card));
});

socket.on("display card bottom", function(data) {
	$("#" + data.id + " .cardstack").append(displayCard(data.card));
});

socket.on("display cards", function(data) {
	for (index in data.cards){
		$("#" + data.id + " .cardstack").append(displayCard(data.cards[index]));
	}
});

function displayCard(card) {
	console.log(card);
	var back = "";
	if (card.showBack) back = "back";
	console.log("'" + card.id + "' - showBack: " + card.showBack);
	return "<li class='animated flipInY card " + card.colour + " " + back + "' id='" + card.id + "' draggable='true' ondragstart='dragCard(event)'>" + card.str + "</li>";
}

///// Drag and drop functionality
function dragCard(event){
	// sets the data that is to be dragged, by the ID of the element.
	event.dataTransfer.setData("text\\plain", event.target.id + ";" + event.path[2].id);
	setTimeout(function() {event.target.style.opacity = .01}, 10);
}

// Displays drop cursor
function allowDrop(event) {
	event.preventDefault(); // data/elements cannot be dropped in other elements by default
}

// Reset opacity on cancel / mistake
document.addEventListener("dragend", function(event){
	event.target.style.opacity = 1;
})

function dropCard(event){
	event.preventDefault(); // open as link on drop by default
	var data = event.dataTransfer.getData("text\\plain").split(";") // the ID of the dropped element
	if(data.length != 2) return false; // not a card

	var destination; // drag to container
	if(event.target.id == "") destination = event.path[1].id;
	else destination = event.path[2].id; // drag to card in container

	socket.emit("play card", {cardID: data[0], origin: data[1], destination: destination});
	// server handles the rest.
}

function setTheme(data) {
	if(data == "black" || data == "dark" || data == "night")
		$('link[rel=stylesheet][href~="/dark.css"]').removeAttr('disabled');
	else if(data == "white" || data == "light" || data == "default")
		$('link[rel=stylesheet][href~="/dark.css"]').attr('disabled', 'disabled');
	document.cookie = ("theme=" + data)
}