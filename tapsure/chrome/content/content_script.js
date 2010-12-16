var TAPSURE_CONTENT = {
	load : function () {
		removeEventListener("load", TAPSURE_CONTENT.load, false);
		
		addEventListener("blur", TAPSURE_CONTENT.blur, true);
		
		addMessageListener("Tapsure:chromeTapLong", TAPSURE_CONTENT.chromeTapLong);
		addMessageListener("Tapsure:unlock", TAPSURE_CONTENT.passwordUnlock);
		
//		addEventListener("unload", TAPSURE_CONTENT.unload, false);
	},
	
	unload : function () {
		removeEventListener("unload", TAPSURE_CONTENT.unload, false);
		
		removeEventListener("blur", TAPSURE_CONTENT.blur, true);
		removeMessageListener("Tapsure:chromeTapLong", TAPSURE_CONTENT.chromeTapLong);
		removeMessageListener("Tapsure:unlock", TAPSURE_CONTENT.passwordUnlock);
	},
	
	blur : function (e) {
		var target = e.originalTarget;

		if ("nodeName" in target) {
			if (target.nodeName.toLowerCase() === 'input' && target.getAttribute("type") && target.getAttribute("type").toLowerCase() === "password" && target.value) {
				sendAsyncMessage("Tapsure:blur", { "password" : target.value });
			}
		}
	},
	
	chromeTapLong : function (msg) {
		sendAsyncMessage("Tapsure:log", { "data" : "Received chromeTapLong" });
		
		var sessionHistory = docShell.QueryInterface(Components.interfaces.nsIWebNavigation).sessionHistory;
		
		content.alert(sessionHistory);
		
		var target = elementFromPoint(msg.json.x, msg.json.y);

		if (!target) {
			sendAsyncMessage("Tapsure:log", { "data" : "No element at point " + msg.json.x + "," + msg.json.y });
		}
		else {
			sendAsyncMessage("Tapsure:log", { "data" : "Element is " + target.nodeName + " " + target.innerHTML });

			if (target.nodeName.toLowerCase() === 'input' && target.getAttribute("type") && target.getAttribute("type").toLowerCase() === "password") {
				if (!target.getAttribute("id")) {
					target.setAttribute("id", "tapsure-" + Math.floor(Math.random() * 10000));
				}

				sendAsyncMessage("Tapsure:tapLong", { "fieldId" : target.getAttribute("id") } );
			}
		}
	},
	
	passwordUnlock : function (msg) {
		var field = content.document.getElementById(msg.json.fieldId);
		field.value = msg.json.password;
		field.style.backgroundColor = "#ff0";

		var colorIndex = 0;
		
		var colorTimer = content.setInterval(function () {
			colorIndex += 25;

			if (colorIndex > 255) {
				field.style.backgroundColor = 'rgb(255, 255, 255)';
				content.clearInterval(colorTimer);
			}
			else {
				field.style.backgroundColor = 'rgb(255, 255, ' + colorIndex + ')';
			}
		}, 100);
	}
};

TAPSURE_CONTENT.load();
//addEventListener("load", TAPSURE.load, false);