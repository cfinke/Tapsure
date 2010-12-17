var TAPSURE_CONTENT = {
	load : function () {
		addEventListener("blur", TAPSURE_CONTENT.blur, true);
		
		addMessageListener("Tapsure:chromeTapLong", TAPSURE_CONTENT.chromeTapLong);
		addMessageListener("Tapsure:unlock", TAPSURE_CONTENT.passwordUnlock);
	},
	
	/*
	
	// There's no documentation on when a content script can remove its message and event listeners.
	
	unload : function () {
		removeEventListener("unload", TAPSURE_CONTENT.unload, false);
		
		removeEventListener("blur", TAPSURE_CONTENT.blur, true);
		removeMessageListener("Tapsure:chromeTapLong", TAPSURE_CONTENT.chromeTapLong);
		removeMessageListener("Tapsure:unlock", TAPSURE_CONTENT.passwordUnlock);
	},
	*/
	
	/**
	 * A content blur event. Check whether it's on a password field.
	 */
	
	blur : function (e) {
		var target = e.originalTarget;

		if ("nodeName" in target) {
			if (target.nodeName.toLowerCase() === 'input' && target.getAttribute("type") && target.getAttribute("type").toLowerCase() === "password" && target.value) {
				sendAsyncMessage("Tapsure:blur", { "password" : target.value });
			}
		}
	},
	
	/**
	 * A long tap originated in chrome; check whether it corresponds to a password input field.
	 */
	
	chromeTapLong : function (msg) {
		var target = elementFromPoint(msg.json.x, msg.json.y);

		if (target) {
			if (target.nodeName.toLowerCase() === 'input' && target.getAttribute("type") && target.getAttribute("type").toLowerCase() === "password") {
				if (!target.getAttribute("id")) {
					target.setAttribute("id", "tapsure-" + Math.floor(Math.random() * 10000));
				}

				sendAsyncMessage("Tapsure:tapLong", { "fieldId" : target.getAttribute("id") } );
			}
		}
	},
	
	/**
	 * The user tapped out a correct pattern.
	 */
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