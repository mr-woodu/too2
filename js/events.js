class EventHandler {
    constructor() {
        this.queuedAction = null;
    }

    static get instance() {
        if (!EventHandler._instance) {
            EventHandler._instance = new EventHandler();
        }
        return EventHandler._instance;
    }

    handleMouseEvents(screenInstance, characterInstance) {
        $(".screen, .canv")
            .mousemove((event) => this.handleMouseMove(event, screenInstance, characterInstance))
            .mouseout(() => this.handleMouseOut())
            .click((event) => this.handleClick(event, screenInstance, characterInstance))
            .contextmenu((event) => this.handleRightClick(event, screenInstance, characterInstance));
    }

    handleMouseMove(event, screenInstance, characterInstance) {
        const { isOnScreen, offsetX, offsetY, isInventory, inventoryItem, inventoryIdx, currentArea, canPick, canUse, isWalkable } = this.getEventItem(event, screenInstance, characterInstance);

        function DEBUG(text) {
            $('#debug').html("<span class='text-primary'>" + text + "</span><br>"
                + _.map(_.keys(characterInstance), (k) => k + ":" + JSON.stringify(characterInstance[k])).join("<br>"))
        }

        if (!isOnScreen) {
            DEBUG(`Out of bounds (${offsetX}, ${offsetY}:`);
            return;
        }

        let cursor = 'default';

        if (isInventory) {
            const text = _.capitalize(inventoryItem.name || '?');
            if (inventoryIdx >= 0) $(".info>div").text(text).show();
            else $(".info>div").text("").hide();

            DEBUG(`Inventory (${offsetX}, ${offsetY}: ${inventoryIdx} / ${JSON.stringify(inventoryItem)})`);
            return;
        } else {
            const text = _.capitalize((currentArea || {}).name || '?');
            if (currentArea) $(".info>div").text(text).show();
            else $(".info>div").text("").hide();

            DEBUG(`Now (${offsetX}, ${offsetY}: ${currentArea ? "(" + currentArea.originalId + "->" + currentArea.idx + ")" : '?'}  walk=${isWalkable}/ ${JSON.stringify(currentArea)} ispck=${canPick}`);

            cursor = (currentArea) ?
                ((canPick) ? 'grab' :
                    (currentArea.exit || currentArea.use) ? 'pointer' :
                        (currentArea.look) ? 'help' :
                            'default') :
                'default';
        }
        $(event.currentTarget).css('cursor', cursor);
    }

    handleMouseOut() {
        $(".info>div").text("").hide();
    }

    handleClick(event, screenInstance, characterInstance) {
        const { isOnScreen, offsetX, offsetY, isInventory, inventoryItem, inventoryIdx, currentArea, canPick, canUse, isWalkable } = this.getEventItem(event, screenInstance, characterInstance);

        let itemInHand = -1;

        if (characterInstance.isMoving) characterInstance.stopMovement();

        if (this.isDragging) {
            itemInHand = this.handleDragging(event, currentArea, canUse, characterInstance, itemInHand);
        }

        if (!currentArea && !isWalkable) return;
        console.log("Clicked area", offsetX, offsetY, currentArea, isWalkable);

        let needToWalk = false;
        let targetCoords = { x: offsetX, y: offsetY };

        const queueOrExecuteAction = (action) => {
            if (needToWalk) {
                this.queueAction(action);
            } else {
                action();
            }
        };

        if (currentArea) {

            const setTargetCoords = (x, y) => {
                targetCoords.x = Math.floor(x * screenInstance.scaleFactor);
                targetCoords.y = Math.floor(y * screenInstance.scaleFactor);
            };

            if (currentArea) {
                if (currentArea.pick) {
                    setTargetCoords(currentArea.pick.pickX, currentArea.pick.pickY);
                    needToWalk = this.needsWalking(characterInstance, targetCoords);
                    queueOrExecuteAction(() => this.handlePick(currentArea, characterInstance));
                } else if (currentArea.use) {
                    setTargetCoords(currentArea.use.useX, currentArea.use.useY);
                    needToWalk = this.needsWalking(characterInstance, targetCoords);
                    queueOrExecuteAction(() => this.handleUse(currentArea, characterInstance, itemInHand));
                } else if (currentArea.exit) {
                    setTargetCoords(currentArea.exit.exitX, currentArea.exit.exitY);
                    needToWalk = this.needsWalking(characterInstance, targetCoords);
                    queueOrExecuteAction(() => this.handleExit(currentArea, characterInstance, screenInstance));
                } else if (currentArea.talk) {
                    setTargetCoords(currentArea.talk.wTalkX, currentArea.talk.wTalkY);
                    needToWalk = this.needsWalking(characterInstance, targetCoords);
                    queueOrExecuteAction(() => this.handleTalk(currentArea, characterInstance, screenInstance));
                } else if (currentArea.look) {
                    queueOrExecuteAction(() => this.handleLook(currentArea, screenInstance));
                }
            }


        }

        if ((isWalkable || needToWalk) && (!characterInstance.actionInProgress())) {
            this.walkCharacter(characterInstance, screenInstance, targetCoords);
        }
    }

    needsWalking(characterInstance, targetCoords) {
        const { x, y } = targetCoords;
        return Math.abs(x - characterInstance.position.left) > 10 || Math.abs(y - characterInstance.position.top) > 10;
    }

    handleDragging(event, currentArea, canUse, characterInstance, itemInHand) {
        console.log("Item is being dragged, processing drag end.", this.isDragging);
        itemInHand = this.isDragging;

        if (currentArea && currentArea.use && canUse && currentArea.use.useWhat == itemInHand) {
            this.queueAction(() => this.handleUse(currentArea, characterInstance,itemInHand));
            this.isDraggingHandled = true;
        } else {
            this.isDraggingHandled = false;
        }
        this.isDragging = false;

        const $draggedItem = $(`.invent[itemId=${itemInHand}]`);
        if (!this.isDraggingHandled) {
            const originalPosition = $draggedItem.data('originalPosition');
            $draggedItem.animate({
                top: originalPosition.top,
                left: originalPosition.left
            }, 'fast');
            return -1;
        }

        $draggedItem.remove();

        return itemInHand;
    }

    walkCharacter(characterInstance, screenInstance, targetCoords) {
        let path = characterInstance.findPathTo(targetCoords.x, targetCoords.y);
        console.log("Found path", path);
        characterInstance.drawPathLine(path);
        characterInstance.moveCharacter(path);
    }


    handleRightClick(event, screenInstance, characterInstance) {
        event.preventDefault();
        const { currentArea } = this.getEventItem(event, screenInstance, characterInstance);

        if (characterInstance.isMoving) characterInstance.stopMovement()

        if (!currentArea) return;
        console.log("Right-clicked area", currentArea);

        if (currentArea.look) {
            this.handleLook(currentArea, screenInstance);
        }
    }

    getEventItem(event, screenInstance, characterInstance) {
        if (!screenInstance.areas) return { isOnScreen: false };
        let sf = screenInstance.scaleFactor;

        screenInstance.screenPos = $(".screen").position();
        screenInstance.screenPos.left = Math.round(screenInstance.screenPos.left);
        screenInstance.screenPos.top = Math.round(screenInstance.screenPos.top);

        const offsetX = event.clientX - screenInstance.screenPos.left;
        const offsetY = event.clientY - screenInstance.screenPos.top;

        const isOnScreen = ((offsetX >= 0) && (offsetX < screenInstance.areas.scaledWidth) && (offsetY >= 0) && (offsetY < screenInstance.areas.scaledHeight));
        const inventoryPos = (offsetX - INVENTORY_LEFT * sf) / (INVENTORY_ITEM_SIZE * sf);
        const isInventory = (offsetY > INVENTORY_TOP * sf) &&
            (offsetY < INVENTORY_TOP * sf + ((INVENTORY_ITEM_SIZE * sf) / 2)) && (Math.floor(inventoryPos) < characterInstance.inventory.length) &&
            ((inventoryPos - Math.floor(inventoryPos)) <= 0.5);

        const inventoryIdx = (isInventory) ? Math.floor((offsetX - INVENTORY_LEFT * sf) / (INVENTORY_ITEM_SIZE * sf)) : -1;
        const inventoryItem = (isInventory) ? INVENTORY_ITEMS[characterInstance.inventory[inventoryIdx].item - 1] : {};

        let currentAreaId = (isOnScreen && !isInventory) ? screenInstance.areas.data[offsetY * screenInstance.areas.scaledWidth + offsetX] - 1 : -1;
        let currentArea = (screenInstance.areaMap[currentAreaId] >= 0) ? screenInstance.areaDetails[screenInstance.areaMap[currentAreaId]] : false
        if (currentArea) currentArea.originalId = currentAreaId;


        let offsetXW = Math.floor(offsetX / screenInstance.scaleFactor * 0.5), // for performance reason this is downscaled, in screen load, getevent and find path
            offsetYW = Math.floor(offsetY / screenInstance.scaleFactor * 0.5)
        let isWalkable = (isOnScreen && !isInventory && screenInstance.paths.grid) ? screenInstance.paths.grid.isWalkableAt(offsetXW, offsetYW) : false;

        let isPickable = currentArea && currentArea.pick ? true : false;
        let canPick = isPickable && !isPicked(currentArea.pick.pickWhat);

        let isUsable = currentArea && currentArea.use ? true : false;
        let canUse = isUsable && (((currentArea.use.useIf > 0) && isUsed(currentArea.use.useIf)) || (!currentArea.use.useIf));


        if (isPickable && !canPick) currentArea = false;

        return { isOnScreen, offsetX, offsetY, isInventory, inventoryItem, inventoryIdx, currentArea, canPick, canUse, isWalkable };
    }

    handleAnimationEnd(characterInstance, screenInstance, ba) {


        if (!ba.path.includes(characterInstance.currentScreen)) return; // ignore ending on non-current screen
        if (ba.play.when != PLAY_CHARACTER_ACTION) return; /// ignore ending on not-character actions

        if (characterInstance.actions.inExit) screenInstance.load(characterInstance.actions.inExit.exitTo);
        else if (characterInstance.actions.pick) addToInventory(characterInstance.actions.pick);
        else if (characterInstance.actions.use) {

            console.log("Animation ended ...", characterInstance.actions, ba)

            let use = characterInstance.actions.use;
            setUsed(use.useWhat);
            if (use.useChange) switchArea(use.originalId, use.useChange - 1);

            $(`.hero[direction=STOP]`).show();

            let timer = characterInstance.actions.timer;
            if (timer && !isPicked(timer.timeNP)) {
                switchArea(timer.timerWhat - 1, timer.timerTo - 1)
                characterInstance.clearActions(true)

                setTimeout(() => {
                    setUsed(use.useWhat, false);
                    switchArea(timer.timerWhat - 1, timer.timerWhat - 1)
                    characterInstance.clearActions()
                    $(`.hero[direction=STOP]`).show();
                }, timer.timer * 5)

                // change. enable ON timer animation for timer.timer * 3 ms
                return;
            }
        }

        if (characterInstance.actions.gameover) {
            $(".loader").css({ 'z-index': '9000' }).html("Game Over")
        }

        characterInstance.clearActions()
    }

    queueAction(action) {
        if (this.queuedAction) return; // If there's already an action queued, don't queue another one
        this.queuedAction = action;
    }

    // Call this method when walking is finished
    handleWalkFinished(characterInstance) {
        if (this.queuedAction) {
            this.queuedAction();
            this.queuedAction = null;
        }
    }


    handlePick(currentArea, characterInstance) {

        if (!currentArea || !currentArea.pick) return false;
        let pick = currentArea.pick;

        if (characterInstance.actionInProgress())
            return false;

        if (pick.pickIf && !isUsed(pick.pickIf)) {
            console.log("Conditioned PICK", pick.pickIf)
            showDescriptionText(MISSING_PICK_OPTION);
            return false;
        }

        if (inInventory(pick.pickWhat)) {
            if (pick.pickAnim) {
                characterInstance.actions.heroAnimId = pick.pickAnim;
                characterInstance.actions.pick = pick;
                if (currentArea.gameover) characterInstance.actions.gameover = currentArea.gameover;
            } else {
                addToInventory(pick);
            }
            if (!isPicked(pick.pickWhat)) setPicked(pick);
        }

        return true;
    }

    handleUse(currentArea, characterInstance, itemInHand) {

        if (!currentArea || !currentArea.use) return false
        let use = currentArea.use;

        if (!_.isEmpty(characterInstance.actions)) return false;

        if (use.useIf && !isUsed(use.useIf)) {
            console.log("Conditioned USE", use.useIf)
            if (itemInHand < 0) showDescriptionText(MISSING_PICK_OPTION);
            return false;
        }

        if ((use.useWhat < AREA_NOT_ITEM) && (use.useWhat != itemInHand)) {
            //alert('Must fix while dragging something');
            showDescriptionText(MISSING_ACTION_ITEM)
            return true;
        }

        if (use.useWhat == itemInHand) removeFromInventory(use.useWhat)
        if (use.useAnim) {
            use.currentAreaId = currentArea.idx;
            use.originalId = currentArea.originalId;
            characterInstance.actions.heroAnimId = use.useAnim;
            characterInstance.actions.use = use;
            if (currentArea.settimernp) characterInstance.actions.timer = currentArea.settimernp;
            if (currentArea.gameover) characterInstance.actions.gameover = currentArea.gameover;

        } else {
            setUsed(use.useWhat);
            if (use.useChange) switchArea(currentArea.originalId, use.useChange - 1);
        }

        return true;
    }

    handleExit(currentArea, characterInstance, screenInstance) {

        if (!currentArea || !currentArea.exit) return false
        let exit = currentArea.exit;

        if (!_.isEmpty(characterInstance.actions)) return false;
        if ((exit.exitNIf && isUsed(exit.exitNIf)) || (exit.exitIf && !isUsed(exit.exitIf))) {
            showDescriptionText(CANT_EXIT);
            return true;
        }

        if (exit.exitAnim) {
            characterInstance.actions.inExit = exit
            characterInstance.actions.heroAnimId = exit.exitAnim;
        } else {
            screenInstance.load(exit.exitTo);
        }

        return true;
    }

    handleTalk(currentArea, characterInstance, screenInstance) {

        if (!currentArea || !currentArea.talk) return false
        let talk = currentArea.talk;

        if (!_.isEmpty(characterInstance.actions)) return false;

        if (talk.talkIf && !isUsed(talk.talkIf)) {
            console.log("Conditioned talk", talk.talkIf)
            return false;
        }

        let dialogues = _.filter(screenInstance.dialogues, { idx: talk.talkTo });
        if (dialogues.length == 0) return false;


        // Increment pos if idx is at the end of the current dialogue texts
        let lastTalk = getAreaChanges(currentArea.idx).lastTalk || { pos: -1, idx: 0 };
        if (lastTalk.idx === 0 && lastTalk.pos < dialogues.length - 1) {
            lastTalk.pos++;
        }

        screenInstance.character.actions.talk = talk;
        screenInstance.character.actions.heroAnimId = talk.animId;


        // Start showing the dialogues
        // area action change is triggered once the dialogue completed (the last one, in hideTalkText)
        showTalkText(dialogues, lastTalk, currentArea, screenInstance, talk);


        // Save the updated lastTalk
        updateAreaChange(currentArea.idx, false, lastTalk)

        return true;

    }



    handleLook(currentArea, screenInstance) {
        if (!currentArea || !currentArea.look) return false;
        let look = currentArea.look;

        if (look.lookIf && !isUsed(look.lookIf)) {
            console.log("Conditioned look", look.lookIf)
            return false;
        }

        let textIdx = (look.lookAt || look) - 1;
        let idx = (currentArea.lastLook + 1 || 0);
        if (!screenInstance.descriptions[textIdx]) return;

        if (idx > screenInstance.descriptions[textIdx].texts.length) idx = 0;
        currentArea.lastLook = idx;

        let text = screenInstance.descriptions[textIdx].texts[idx];
        if (text) showDescriptionText(text);
        else hideDescriptionText();

        console.log("showing text", look, idx, textIdx, text);
    }
}




const hideDescriptionText = () => {
    if (timeoutId.desc) clearTimeout(timeoutId.desc);
    $(".desc>div").text("").hide();
}
const showDescriptionText = (text) => {
    if (timeoutId.desc) clearTimeout(timeoutId.desc);

    $(".desc>div").html(text.replace("|", "<br>")).show();
    timeoutId.desc = setTimeout(() => $(".desc>div").text('').hide(), 1000);
};

const showTalkText = (dialogues, lastTalk, currentArea, screenInstance, talk) => {
    // Clear any existing timeout to prevent overlapping texts
    if (timeoutId.talk) clearTimeout(timeoutId.talk);

    // Show the current text
    let textEntry = dialogues[lastTalk.pos].texts[lastTalk.idx];
    let speaker = textEntry.charAt(0); // Assuming G or X is the first character
    let text = textEntry.match(/\{(.*?)\}/)?.[1] || textEntry; // Extract text within { }

    if (text) {
        $(".talk>div").html(text.replace("|", "<br>")).show();

        // Position the .talk element
        if (speaker === 'X') {
            $(".talk").css({ left: talk.talkX * screenInstance.scaleFactor, top: talk.talkY * screenInstance.scaleFactor }).addClass('talkX');
        } else {
            $(".talk").css({ left: talk.wTalkX * screenInstance.scaleFactor, top: (talk.wTalkY - 150) * screenInstance.scaleFactor }).removeClass('talkX');
        }

        Screen.instance.character.actions.speaker = speaker;

        // Set a timeout to show the next text after 1 second
        timeoutId.talk = setTimeout(() => {
            // Increment the idx
            if (lastTalk.idx < dialogues[lastTalk.pos].texts.length - 1) {
                lastTalk.idx++;
            } else {
                // Hide the talk text if we reach the end
                hideTalkText(currentArea, talk);
                return;
            }

            // Save the updated lastTalk
            updateAreaChange(currentArea.idx, false, lastTalk)

            // Recursively call showTalkText to continue the sequence
            showTalkText(dialogues, lastTalk, currentArea, screenInstance, talk);
        }, 1000);
    } else {
        hideTalkText(currentArea, talk);
    }
};

const hideTalkText = (currentArea, talk) => {
    $(".talk>div").text('').hide();
    // Reset the index to 0 when hiding the text

    let lastTalk = getAreaChanges(currentArea.idx).lastTalk
    lastTalk.idx = 0;
    updateAreaChange(currentArea.idx, false, lastTalk)

    if (talk.talkAC)
        setUsed(talk.talkAC)

    // trigger area change
    if (talk.talkChange)
        switchArea(currentArea.originalId, talk.talkChange - 1)

    Screen.instance.character.clearActions();
};



const switchArea = (areaFrom, areaTo) => {
    if (areaFrom == areaTo - 1) return;

    console.log('Switching area', areaFrom, 'to', areaTo - 1)

    Screen.instance.areaMap[areaFrom] = areaTo - 1;
    updateAreaChange(areaFrom, areaTo, false)
};

const updateAreaChange = (areaIdx, areaTo, lastTalk) => {

    let areaChanges = getAreaChanges(areaIdx);
    if (areaTo)
        areaChanges.chTo = areaTo;

    if (lastTalk)
        areaChanges.lastTalk = lastTalk;

}

const getAreaChanges = (areaIdx) => {
    let screeName = Character.instance.currentScreen;
    let areaChanges = Character.instance.areaChanges
    if (!areaChanges[screeName]) areaChanges[screeName] = {};
    if (!areaChanges[screeName][areaIdx]) areaChanges[screeName][areaIdx] = {};

    return areaChanges[screeName][areaIdx]
}