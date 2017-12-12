var commandHistory = ["begin"]

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

var selectionIndex = -1;
jInput.keyup(function(e){
	//console.log(e.keyCode);
	if (e.keyCode == 38) { // up arrow
		if(selectionIndex < commandHistory.length-1)
			selectionIndex++;
		jInput.val(commandHistory[selectionIndex]);
	} else if (e.keyCode == 40) {
		if(selectionIndex > -1){
			selectionIndex--;
			jInput.val(commandHistory[selectionIndex]);
		} else {
			jInput.val("");
		}
	}
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

$("main").click(function(){
	jInput.focus();
})

function updateUserCount(count){
	if(count === undefined)
		$("#info-online-count").html();
	else
		$("#info-online-count").html(count + " in room");
};

var id;
const socket = io.connect("/");

var room = "";
if(window.location.pathname.slice(0, 6) == "/room/")
	room = window.location.pathname.slice(6);
socket.emit("join room", room);
$("#info-room").html("room=" + room);

// socket.io debugging
//localStorage.debug = "*";

socket.on("connect", function() {
	$("#connection-info").addClass("connected");
	try{
		$('meta[name=theme-color]').attr('content', '#266d26')
	} catch(e){};
	$("#info-online").html("connected");
	$(".cardstack-container").remove(); // resets display
	$("#info-id").html("id=" + socket.id);
});

socket.on("reconnect", function(){
	console.log("reconnected!");
	// TODO: handle continue
	// this is very broken atm
})

socket.on("disconnect", function() {
	$("#connection-info").removeClass("connected");
	$('meta[name=theme-color').attr('content', '#6d2626')
	$("#info-online").html("disconnected");
	updateUserCount();
});
// could make this serverside but meh
socket.on("theme", setTheme)

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
	$("#table cardstack-container").remove();
});

$(document).ready(function() { init(); })

// exit warning DEBUG DISABLED
//window.onbeforeunload = function() {return true;};

window.onunload = function() {
	socket.emit('leave');
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
var cardstacks = []
function newCardStack(data) {
	var drop = "";
	if(data.display == "user" || data.display == "pile")
		drop = ' ondrop="dropCard(event)" ondragover="allowDrop(event)"';
	var stack = $("#table").append('<div class="cardstack-container ' + data.display + '" id="' + data.id + '"' + drop + '><div class="cardstack-box"><div class="cardstack"></div></div><div class="cardstack-head"><h2 class="cardstack-title">' + data.title + '</h2><small class="cardstack-count"></small></div></div>')
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
	if(data.count === undefined)
		$("#" + data.id + " .cardstack-count").html("");
	else
		$("#" + data.id + " .cardstack-count").html("(" + data.count + ")");
})

socket.on("clear cardstack", function(data) {
	$("#" + data.id + " .cardstack li").remove();
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
	var transform = "transform: rotate("+r+"deg) translate(" + x + "px, " + y + "px); -webkit-transform: rotate("+r+"deg) translate(" + x + "px, " + y + "px); -moz-transform: rotate("+r+"deg) translate(" + x + "px, " + y + "px)";
	var draggable = false;
	if ($("#" + id).hasClass("user") || $("#" + id).hasClass("deck")) draggable = true;
	return "<li class='card " + card.colour + "' id='" + card.id + "' draggable=" + draggable + " ondragstart='dragCard(event)' style='" + transform + "'>" + card.str + "</li>";
}

window.addEventListener('touchmove', function() {})

///// Drag and drop functionality
function dragCard(event){
	// sets the data that is to be dragged, by the ID of the element.
	event.dataTransfer.setData("text\\plain", event.target.id + ";" + event.path[3].id);
	event.dataTransfer.dropEffect = "move";
	setTimeout(function() {event.target.style.opacity = .01}, 10);
	console.log("dragging")
}

// Displays drop cursor
function allowDrop(event) {
	event.preventDefault(); // data/elements cannot be dropped in other elements by default
	// Set the dropEffect to move
 	event.dataTransfer.dropEffect = "move"
 	console.log("allow drop")
}

// Reset opacity on cancel / mistake
document.addEventListener("dragend", function(event){
	event.target.style.opacity = 1;
	console.log("dragend")
})

function dropCard(event){
	event.preventDefault(); // open as link on drop by default
	var data = event.dataTransfer.getData("text\\plain").split(";") // the ID of the dropped element
	if(data.length != 2) return false; // not a card

	var destination; // drag to container
	if(event.target.id == "") destination = event.path[2].id;
	else destination = event.path[3].id; // drag to card in container

	socket.emit("play card", {cardID: data[0], origin: data[1], destination: destination});
	// server handles the rest.
	console.log("dropped")
}




function setTheme(data) {
	if(data == "black" || data == "dark" || data == "night")
		$('link[rel=stylesheet][href~="/dark.css"]').removeAttr('disabled');
	else if(data == "white" || data == "light" || data == "default")
		$('link[rel=stylesheet][href~="/dark.css"]').attr('disabled', 'disabled');
	document.cookie = ("theme=" + data)
}