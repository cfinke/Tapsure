var TAPSURE = {
	/**
	 * Previously saved patterns are kept in memory here for faster access.
	 */
	patterns : [],
	
	_prefs : null,
	get prefs() {
		if (!TAPSURE._prefs) { 
			TAPSURE._prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.tapsure.");
			TAPSURE._prefs.QueryInterface(Components.interfaces.nsIPrefBranch2);
			TAPSURE._prefs.addObserver("", TAPSURE, false);
		}
		
		return TAPSURE._prefs;
	},
	
	_strings : null,
	get strings() { if (!TAPSURE._strings) { TAPSURE._strings = document.getElementById("tapsure-bundle"); } return TAPSURE._strings; },
	
	load : function () {
		TAPSURE.log("in load");
		
		removeEventListener("load", TAPSURE.load, false);
		
		// Listener to initialize options panel state when it's available.
		document.getElementById("addons-list").addEventListener("AddonOptionsLoad", TAPSURE.optionsLoad, false);
		
		// tapLong on a password field initiates tap-password entry.
		messageManager.addMessageListener("Tapsure:tapLong", TAPSURE.tapLongEvent);
		
		// blur on a password field initiates the request from the add-on to add a tap pattern
		messageManager.addMessageListener("Tapsure:blur", TAPSURE.blurEvent);
		
		// Logging method for the content script.
		messageManager.addMessageListener("Tapsure:log", TAPSURE.logEvent);
		
		messageManager.loadFrameScript("chrome://tapsure/content/content_script.js", true);
		
		// TapLong listener to send TapLong events to the content script.
		document.addEventListener("TapLong", TAPSURE.chromeTapLong, false);
		
		TAPSURE.loadPatterns();
		
		addEventListener("unload", TAPSURE.unload, false);
		
		TAPSURE.log("out load");
	},
	
	unload : function () {
		TAPSURE.log("in unload");
		
		removeEventListener("unload", TAPSURE.unload, false);
		
		document.getElementById("addons-list").removeEventListener("AddonOptionsLoad", TAPSURE.optionsLoad, false);
		
		document.removeEventListener("TapLong", TAPSURE.chromeTapLong, false);
		
		messageManager.removeMessageListener("Tapsure:tapLong", TAPSURE.tapLongEvent);
		messageManager.removeMessageListener("Tapsure:blur", TAPSURE.blurEvent);
		messageManager.removeMessageListener("Tapsure:log", TAPSURE.logEvent);
		
		TAPSURE.prefs.removeObserver("", TAPSURE);
		
		TAPSURE.log("out unload");
	},
	
	observe : function(subject, topic, data) {
		if (topic != "nsPref:changed") {
			return;
		}
		
		switch(data) {
			case "neverPrompt":
				TAPSURE.toggleResetButton();
			break;
		}
	},
	
	/**
	 * Long tap event - sends it to the content script.
	 */
	
	chromeTapLong : function (e) {
		var browser = getBrowser();
		
		var pos = browser.transformClientToBrowser(e.clientX, e.clientY);
		
		browser.messageManager.sendAsyncMessage("Tapsure:chromeTapLong", pos);
	},
	
	/**
	 * Initializes the options panel once it's been activated.
	 */
	
	optionsLoad : function () {
		TAPSURE.log("in optionsLoad");
		
		TAPSURE.toggleResetButton();
		
		TAPSURE.log("out optionsLoad");
	},
	
	/**
	 * Sets the state of the "Clear all patterns" button.
	 */
	
	toggleResetButton : function () {
		TAPSURE.log("in toggleResetButton");
		
		var shouldBeEnabled = false;
		var resetButton = document.getElementById("tapsure-button-reset");
		
		if (resetButton) {
			if (TAPSURE.patterns.length > 0) {
				shouldBeEnabled = true;
			}
			
			if (!shouldBeEnabled) {
				if (TAPSURE.prefs.getCharPref("neverPrompt") != "[]") {
					shouldBeEnabled = true;
				}
			}
			
			if (shouldBeEnabled) {
				resetButton.removeAttribute("disabled");
			}
			else {
				resetButton.setAttribute("disabled", "true");
			}
		}
		
		TAPSURE.log("out toggleResetButton");
	},
	
	/**
	 * Loads the previously saved tap patterns into memory.
	 */
	
	loadPatterns : function () {
		TAPSURE.log("in loadPatterns");
		
		var loginManager = Components.classes["@mozilla.org/login-manager;1"].getService(Components.interfaces.nsILoginManager);
		
		var hostname = "chrome://tapsure";
		var formSubmitURL = "chrome://tapsure";
		
		var logins = loginManager.findLogins({}, hostname, formSubmitURL, null);
		
		for (var i = 0; i < logins.length; i++) {
			TAPSURE.patterns.push( { "pattern" : JSON.parse(logins[i].username), "password" : logins[i].password } );
		}
		
		TAPSURE.log("Patterns: " + TAPSURE.patterns.toSource());
		
		TAPSURE.toggleResetButton();
		
		TAPSURE.log("out loadPatterns");
	},
	
	relevantPasswordFieldId : null,
	returnMessageManager : null,
	
	/**
	 * Confirmation from the content script when the TapLong was on a password field.
	 */
	
	tapLongEvent : function (msg) {
		TAPSURE.log("in tapLongEvent");
		
		TAPSURE.returnMessageManager = msg.target.QueryInterface(Components.interfaces.nsIFrameLoaderOwner).frameLoader.messageManager;
		TAPSURE.relevantPasswordFieldId = msg.json.fieldId;
		
		TAPSURE.showPatternAttemptDialog();
		
		TAPSURE.log("out tapLongEvent");
	},
	
	attemptPatternDialog : null,
	
	/**
	 * Loads the dialog to allow the user to enter a password via tap.
	 */
	
	showPatternAttemptDialog : function () {
		TAPSURE.attemptPatternDialog = importDialog(null, "chrome://tapsure/content/pattern_attempt.xul");
		
		document.getElementById("tapsure-attempt-pattern-target").addEventListener("click", TAPSURE.attemptPatternClick, false);
	},
	
	/**
	 * Hides the password entry dialog.
	 */
	
	hidePatternAttemptDialog : function () {
		document.getElementById("tapsure-attempt-pattern-target").removeEventListener("click", TAPSURE.attemptPatternClick, false);
		
		TAPSURE.attemptPatternDialog.close();
		TAPSURE.attemptPatternDialog = null;
	},
	
	analysisTimer : null,
	
	/**
	 * Event generated by the user tapping on the password entry tap target.
	 */
	attemptPatternClick : function (evt) {
		TAPSURE.log("in attemptPatternClick");
		
		if (TAPSURE.analysisTimer) clearTimeout(TAPSURE.analysisTimer);
		
		var now = new Date().getTime();
		
		// Give visual feedback in the button that it was tapped.
		var targetButton = document.getElementById("tapsure-attempt-pattern-target");
		TAPSURE.fadeColor(targetButton, "backgroundColor", 255, 255, 0, 255, 255, 255, 100);
		
		TAPSURE.sequence.push(now);
		
		// If the user goes a full second without tapping, analyze their tap sequence so far.
		TAPSURE.analysisTimer = setTimeout(function () {
			var password = TAPSURE.analyzeSequence(TAPSURE.sequence);
			
			TAPSURE.sequence = [];
			
			if (password) {
				// Enters the password into the input field that triggered the long tap.
				TAPSURE.returnMessageManager.sendAsyncMessage("Tapsure:unlock", { "password" : password, "fieldId" : TAPSURE.relevantPasswordFieldId });
				
				TAPSURE.returnMessageManager = null;
				TAPSURE.relevantPasswordFieldId = null;
				
				TAPSURE.hidePatternAttemptDialog();
			}
			else {
				// The pattern entered doesn't match any stored patterns.
				
				// Visual feedback - Shake it like a polaroid picture.
				var box = document.getElementById("tapsure-attempt-pattern-target");
				TAPSURE.shake(box);
			}
		}, 1000);
		
		TAPSURE.log("out tapEvent");
	},
	
	/**
	 * The user unfocused a password field after entering a value.
	 * Check if they want to convert this password to a tap pattern.
	 * @todo Don't ask again on the same passwords.
	 */
	
	blurEvent : function (msg) {
		TAPSURE.log("in blurEvent");
		
		var password = msg.json.password;
		var patternExists = false;
		
		TAPSURE.patterns.forEach(function (entry) {
			if (!patternExists && entry.password == password) {
				patternExists = true;
			}
		});
		
		if (!patternExists) {
			if (TAPSURE.shouldPrompt(password)) {
				TAPSURE.pendingPassword = password;
			
				var box = window.getNotificationBox(content);
				// @todo image
				var appendedBox = box.appendNotification(
					TAPSURE.strings.getString("tapsure.savePrompt.label"),
					"tapsure", 
					null, 
					box.PRIORITY_INFO_MEDIUM, 
					[
						{ 
							accessKey : TAPSURE.strings.getString("tapsure.savePrompt.yes.key"), 
							label : TAPSURE.strings.getString("tapsure.savePrompt.yes"), 
							callback : TAPSURE.showPatternAddDialog
						},
						{
							accessKey : TAPSURE.strings.getString("tapsure.savePrompt.no.key"), 
							label : TAPSURE.strings.getString("tapsure.savePrompt.no"), 
							callback : TAPSURE.neverAsk
						}
					]
				);
				
				// This is how the Firefox 3.6-style password save notifications stick around for a couple pageloads.
				appendedBox.persistence++;
				appendedBox.timeout = (new Date().getTime()) + 20000;
			}
		}
		
		TAPSURE.log("out blurEvent");
	},
	
	neverAsk : function () {
		var hash = TAPSURE_MD5("tapsure" + TAPSURE.pendingPassword);
		
		var hashes = [];
		
		var hashesText = TAPSURE.prefs.getCharPref("neverPrompt");
		if (hashesText) {
			try {
				hashes = JSON.parse(hashesText);
			} catch (e) { }
		}
		
		if (hashes.indexOf(hash) == -1) {
			hashes.push(hash);
		}
		
		TAPSURE.prefs.setCharPref("neverPrompt", JSON.stringify(hashes));
	},
	
	addPatternTimer : null,
	addPatternSequence : [],
	
	pendingPassword : null,
	
	/**
	 * Event generated by the user tapping on the "Create a pattern" target
	 */
	
	addPatternClick : function (evt) {
		TAPSURE.log("in addPatternClick");
		
		if (TAPSURE.addPatternTimer) clearTimeout(TAPSURE.addPatternTimer);
		
		TAPSURE.addPatternSequence.push(new Date().getTime());
		
		// Visual feedback of the tap.
		var input = evt.originalTarget;
		TAPSURE.fadeColor(input, "backgroundColor", 255, 255, 0, 255, 255, 255, 100);
		
		// After a second of inactivity, save the pattern.
		TAPSURE.addPatternTimer = setTimeout(function () {
			if (TAPSURE.addPatternSequence.length > 2) {
				var field = document.getElementById("tapsure-add-pattern-target");
			
				if (TAPSURE.analyzeSequence(TAPSURE.addPatternSequence)) {
					// The pattern matched too closely an existing pattern.
					document.getElementById("tapsure-pattern-add-instructions").selectedIndex = 1;
					
					// TAPSURE.fadeColor(field, "backgroundColor", 255, 0, 0, 255, 255, 255);
					TAPSURE.shake(field);
				}
				else {
					// Save the pattern for this password.
				
					document.getElementById("tapsure-pattern-add-instructions").selectedIndex = 0;
				
					var baseline = TAPSURE.addPatternSequence[0];
				
					var normalizedSequence = TAPSURE.addPatternSequence.map(function (el) {
						return el - baseline;
					});
					
					TAPSURE.addPattern(normalizedSequence, TAPSURE.pendingPassword);
					
					TAPSURE.pendingPassword = null;
					
					TAPSURE.hidePatternAddDialog();
					
					/*
					TAPSURE.fadeColor(field, "backgroundColor", 255, 255, 0, 255, 255, 255);
				
					var button = document.getElementById("tapsure-pattern-add-close");
					button.setAttribute("label", button.getAttribute("label-success"));
				
					setTimeout(function (aButton) {
						aButton.setAttribute("label", aButton.getAttribute("label-default"));
					}, 3000, button);
					*/
				}
			}
			
			TAPSURE.addPatternSequence = [];
		}, 1000);
		
		TAPSURE.log("out addPatternClick");
	},
	
	addPatternDialog : null,
	
	/**
	 * Opens the dialog to create a tap pattern. 
	 */
	
	showPatternAddDialog : function () {
		TAPSURE.addPatternDialog = importDialog(null, "chrome://tapsure/content/pattern_add.xul");
		
		document.getElementById("tapsure-pattern-add-instructions").selectedIndex = 0;
		
		var addPatternTarget = document.getElementById("tapsure-add-pattern-target");
		addPatternTarget.addEventListener("click", TAPSURE.addPatternClick, false);
		
		addPatternTarget.focus();
	},
	
	/**
	 * Hides the "Create a pattern" dialog
	 */
	
	hidePatternAddDialog : function () {
		var addPatternTarget = document.getElementById("tapsure-add-pattern-target");
		addPatternTarget.removeEventListener("click", TAPSURE.addPatternClick, false);

		TAPSURE.addPatternDialog.close();
		TAPSURE.addPatternDialog = null;
	},
	
	/**
	 * Saves a tap pattern with its password.
	 */
	
	addPattern : function (sequence, password) {
		var loginManager = Components.classes["@mozilla.org/login-manager;1"].getService(Components.interfaces.nsILoginManager);
		var nsLoginInfo = new Components.Constructor("@mozilla.org/login-manager/loginInfo;1", Components.interfaces.nsILoginInfo, "init");
		var loginInfo = new nsLoginInfo("chrome://tapsure", "chrome://tapsure", null, JSON.stringify(sequence), password, "", "");
		loginManager.addLogin(loginInfo);
		
		TAPSURE.patterns.push( { "pattern" : sequence, "password" : password } );
		
		TAPSURE.toggleResetButton();
	},
	
	shouldPrompt : function (password) {
		var hash = TAPSURE_MD5("tapsure" + password);
		var hashes = [];
		var hashesText = TAPSURE.prefs.getCharPref("neverPrompt");
		if (hashesText) {
			try {
				hashes = JSON.parse(hashesText);
			} catch (e) { }
		}
		
		if (hashes.indexOf(hash) != -1) {
			return false;
		}
		
		return true;
	},
	
	/**
	 * Removes all stored tap patterns and resets preferences. 
	 */
	
	reset : function () {
		TAPSURE.log("in reset");
		
		var loginManager = Components.classes["@mozilla.org/login-manager;1"].getService(Components.interfaces.nsILoginManager);
		
		var hostname = "chrome://tapsure";
		var formSubmitURL = "chrome://tapsure";
		
		var logins = loginManager.findLogins({}, hostname, formSubmitURL, null);
		
		for (var i = 0; i < logins.length; i++) {
			loginManager.removeLogin(logins[i]);
		}
		
		TAPSURE.patterns = [];
		
		TAPSURE.prefs.setCharPref("neverPrompt", "[]");
		
		TAPSURE.toggleResetButton();
	},
	
	/**
	 * The current password attempt pattern.
	 */
	sequence : [ ],
	
	/**
	 * Determine whether a sequence matches an existing pattern. 
	 */
	analyzeSequence : function (seq) {
		if (seq.length > 0) {
			patternLoop : for (var q = 0, _len = TAPSURE.patterns.length; q < _len; q++) {
				if (typeof TAPSURE.patterns[q] == 'undefined') continue;
				
				var target = TAPSURE.patterns[q].pattern;
				var target_duration = target[target.length - 1];
				
				if (seq.length >= target.length) {
					var attempt = seq.slice(seq.length - target.length);
					
					var baseline = attempt[0];
					
					// Normalize each timestamp to the time since the first click.
					var attempt = attempt.map(function (el) { return el - baseline; });
					
					var attempt_duration = attempt[attempt.length - 1];
				
					// Discard sequences that are 50% longer or shorter than the original sequence.
					if (Math.abs(attempt_duration - target_duration) > (target_duration * 0.5)) {
						return false;
					}
					
					var lengthRatio = target_duration / attempt_duration;
					
					// Normalize the total length of the sequence.
					attempt = attempt.map(function (el, idx, arr) {
						return Math.round(el * lengthRatio);
					});
					
					// Allow a variation on each click relative to the length of the original rhythm.
					var allowedVariation = Math.round(target_duration / 10);
				
					for (var i = 0, _len = attempt.length; i < _len; i++) {
						if (Math.abs(attempt[i] - target[i]) > allowedVariation) {
							continue patternLoop;
						}
					}
					
					return TAPSURE.patterns[q].password;
				}
			}
		}
		
		TAPSURE.log("out analyzeSequence");
		
		return false;
	},
	
	/**
	 * Helper function to provide visual feedback via a color fade.
	 */
	fadeColor : function (element, colorProperty, r1, g1, b1, r2, g2, b2, duration) {
		if (!duration) {
			duration = 1000;
		}
		
		element.style[colorProperty] = "rgb(" + r1 + ", " + g1 + ", " + b1 + ")";
		
		var idx = 0;
		var timeStep = 100;
		
		var stepAmount = duration / timeStep;
		
		var rStepAmount = Math.round((r2 - r1) / stepAmount);
		var gStepAmount = Math.round((g2 - g1) / stepAmount);
		var bStepAmount = Math.round((b2 - b1) / stepAmount);
		
		var colorTimer = setInterval(function () {
			idx++;
			
			var ratio = (duration / timeStep) * idx
			element.style[colorProperty] = "rgb(" + Math.max(0, Math.min(255, r1 + (rStepAmount * idx))) + ", " + Math.max(0, Math.min(255, g1 + (gStepAmount * idx))) + ", " + Math.max(0, Math.min(255, b1 + (bStepAmount * idx))) + ")";
			
			if (duration / timeStep <= idx) {
				clearInterval(colorTimer);
			} 
		}, timeStep);
	},
	
	/**
	 * Helper function to provide visual feedback via shaking the element from side to side.
	 */
	shake : function (element, maxOffset, duration) {
		if (!maxOffset) maxOffset = 1.0;
		if (!duration) duration = 1000;
		
		var timeStep = 100;
		var stepIndex = 1;
		
		var maxSteps = duration / timeStep;
		
		var shakeTimer = setInterval(function () {
			if (stepIndex >= maxSteps) {
				offset = 0;
				clearTimeout(shakeTimer);
			}
			else {
				var offset = maxOffset / stepIndex++;
				
				if (stepIndex % 2) {
					offset *= -1;
				}
			}
			
			element.style.marginRight = offset + "in";
		}, 100);
	},
	
	logEvent : function (msg) {
		TAPSURE.log(msg.json.data);
	},
	
	log : function (msg) {
		var consoleService = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
		consoleService.logStringMessage("TAPSURE: " + msg);
	}
};