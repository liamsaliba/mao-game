var commandHistory = []

const jInput = $("#input")

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

FORMAT = {"DEFAULT": 0, "IMPORTANT": 1, "DEBUG": 2}

function output(str, format) {
	if(format == FORMAT.IMPORTANT)
		$("#output").html("<span class='animated infinite pulse'>" + str + "</span>");
	else if(format == FORMAT.DEBUG)
		$("#output").html("<span class='code'>" + str + "</span>");
	else
		$("#output").html("<span class='animated bounce submitted'>" + str + "</span>");
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


const socket = io.connect();
// connect routine
//localStorage.debug = "*";

socket.on("connect", function() {
	$("#connection-info").addClass("connected");
	$("#info-online").html("connected");
})

socket.on("disconnect", function() {
	$("#connection-info").removeClass("connected");
	$("#info-online").html("disconnected");
	updateUserCount();
});

socket.on("broadcast", function(data) {
	output(data, FORMAT.IMPORTANT)
});

socket.on("refresh", function() {
	location.reload(true);
});

socket.on("user count", function(count) {
	updateUserCount(count);
});

socket.on("remove placeholder", function(){
	$("#input").removeAttr('placeholder');
});

socket.on("clear table", function() {
	$("#table *").remove();
});

socket.on("id", function(data) {
	$("#info-id").html("id=" + data.id);
})

$(document).ready(function() { init(); })

window.onbeforeunload = function() {
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
	$("#table").append('<div class="cardstack-container" id="' + data.id + '"><h2 class="cardstack-title">' + data.title + '</h2><small class="cardstack-count"></small><div class="cardstack"></div>');
}

socket.on("del cardstack", function(data){
	$("#" + data.id).remove();
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
	var back = "";
	if (card.showBack) back = "back";
	console.log("showBack: " + card.showBack);
	console.log("'" + card.id + "'");
	return "<li class='animated flipInY card " + card.colour + " " + back + "' id='" + card.id + "'>" + card.str + "</li>";
}