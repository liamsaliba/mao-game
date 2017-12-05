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

socket.on("clear table", clearTable);

$(document).ready(function() { init(); })

window.onbeforeunload = function() {
	socket.emit('leave');
	socket.disconnect();
};


function clearTable() {
	$("#table *").remove();
}

jTable = $("#table");

class DisplayCardStack {
	constructor(title, id) {
		this.title = id;
		this.id = id;
		this.init();
	}
	// makes base structure for card stack
	init() {
		jTable.append('<div class="cardstack-container" id="cardstack-' + this.id + '"><h2 class="cardstack-title">' + this.title + '</h2><small class="cardstack-count"></small><div class="cardstack"></div>')
	}

	displayHand() {

	}

}
cardstacks = {};

socket.on("new cardstack", function(data) {
	cardstacks[data.id] = new DisplayCardStack(data.title, data.id);	
});


clearTable();