// Singleton for inventory management
class InventoryView {
    constructor() {
        this.items = INVENTORY_ITEMS;
    }

    static get instance() {
        if (!InventoryView._inst) {
            InventoryView._inst = new InventoryView();
        }
        return InventoryView._inst;
    }

    show() {
        $(".invent").remove();
        Character.instance.inventory.forEach((invent, i) => {
            let item = invent.item;
            let posX = INVENTORY_LEFT * Screen.instance.scaleFactor + INVENTORY_ITEM_SIZE * Screen.instance.scaleFactor * i;
            let posY = INVENTORY_TOP * Screen.instance.scaleFactor;
            $(`<img src='data/INVENT/LARGE/00${item}.gif' class='invent' style='left:${posX}px;top:${posY}px'>`)
                .data('originalPosition', { left: posX, top: posY })
                .data('itemId', item)
                .attr('itemId', item)
                .appendTo($(".screen"));
        });

        this.handleDragInventory();
    }

    handleDragInventory() {
        $('.invent').draggable({
            start: function (event, ui) {
                const $this = $(this);
                EventHandler.instance.isDragging = $this.data('itemId');  // Ensure this is data-itemid
            },
            stop: function (event, ui) {
                console.log('Drop end', EventHandler.instance.isDragging);

                // Trigger click event at the current mouse position
                const clickEvent = new MouseEvent('click', {
                    view: window,
                    bubbles: true,
                    cancelable: true,
                    clientX: event.clientX,
                    clientY: event.clientY
                });
                document.elementFromPoint(event.clientX, event.clientY).dispatchEvent(clickEvent);
            }
        });
    }

}

// Singleton for the character
class Character {
    constructor() {
        this.initializeCharacter();
    }

    initializeCharacter() {
        // Default character state
        this.inventory = [{ item: 5 }];
        this.items = [];
        this.areasUsed = [];
        this.areaChanges = {}
        this.actions = {};
        this.position = {}
        this.animations = {}
        this.currentScreen = "JUNGLE"

        this.isMoving = false;
        this.moveQueue = [];
        this.currentMoveSession = 0;

        // Load saved game state if available
        const savedGame = this.loadSavedGame();
        if (savedGame) {
            Object.assign(this, savedGame);
            this.isMoving = false;
            this.moveQueue = [];
            this.currentMoveSession = 0;
        }
    }

    loadCharacterAnim() {

        let _this = this;
        ["LEFT", "RIGHT", "DOWN", "UP", "STOP"].forEach(dir => {
            let phase = $(`<img src='data/HERO/${dir}.gif' class='hero' direction="${dir}">`)
            $(phase).appendTo($(".screen .character"))

            var rub = new SuperGif({
                gif: phase[0],
                auto_play: false,
                show_progress_bar: false,
                draw_while_loading: false,
                max_width: phase.width() * Screen.instance.scaleFactor,
                canvas_css: {
                    transform: `scale(${Screen.instance.scaleFactor},${Screen.instance.scaleFactor})`,
                    display: "none"
                },
            });

            rub.load(function (gif) {
                let canvas = rub.get_canvas();
                $(canvas).attr("direction", dir);
                $(canvas).parent().attr("direction", dir);
                $(canvas).addClass("hero")
                _this.animations[dir] = rub;
            });

        })
    }

    showCharacter(pos) {
        if (pos) {
            this.height = Math.floor(114 * Screen.instance.scaleFactor);
            this.position = {
                left: Math.floor(pos.left * Screen.instance.scaleFactor),
                top: Math.floor(pos.top * Screen.instance.scaleFactor)
            }
        }

        if (!this.position.left) return;
        let zidx = this.inForegroundBox(this.position.left, this.position.top) ? '9' : '6';

        $(`.hero[direction=STOP]`).show()
            .css({
                left: this.position.left,
                top: this.position.top - this.height,
                'z-index': zidx
            })
    }


    // Function to move the image along the given coordinates with continuous speed
    moveCharacter(path) {
        this.moveQueue.push(path);
        if (!this.isMoving) {
            this.processQueue();
        }
    }

    processQueue(lastPath) {

        let scaleFactor = Screen.instance.scaleFactor;

        if (this.moveQueue.length === 0) {
            if (lastPath) {
                this.position.left = _.last(lastPath)[0]
                this.position.top = _.last(lastPath)[1]
            }
            this.stopCharacter();
            this.isMoving = false;
            EventHandler.instance.handleWalkFinished(this);
            //console.log("totally stopped", lastPath);
            $(".path").remove()
            return;
        }

        const path = this.moveQueue.shift();
        this.currentMoveSession++; // Increment the move session identifier for a new session
        const currentSession = this.currentMoveSession;

        let $characterStop = $('.hero[direction=STOP]')
        $characterStop.hide();
        const SPEED = 1; // more - slower

        const calculateDistance = (point1, point2) => {
            const dx = point2[0] - point1[0];
            const dy = point2[1] - point1[1];
            return Math.sqrt(dx * dx + dy * dy);
        };

        const getDirection = (dx, dy) => {
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            if (angle >= -45 && angle < 45) {
                return 'RIGHT';
            } else if (angle >= 45 && angle < 135) {
                return 'DOWN';
            } else if (angle >= -135 && angle < -45) {
                return 'UP';
            } else {
                return 'LEFT';
            }
        };

        const dx = path[1][0] - path[0][0];
        const dy = path[1][1] - path[0][1];
        let currentDirection = getDirection(dx, dy);
        let $character = $(".hero[direction=" + currentDirection + "]")//;.show();

        this.isMoving = true;

        const moveImage = (path, speed) => {
            let index = 0;
            let counter = 0;

            const updatePosition = () => {
                if (!this.isMoving || currentSession !== this.currentMoveSession) {
                    this.stopCharacter($character, currentSession !== this.currentMoveSession);
                    return; // Stop if the flag is false
                }

                if ((index < path.length - 1)) {
                    const start = path[index];
                    const end = path[index + 1];
                    const distance = calculateDistance(start, end);
                    const steps = distance / speed;
                    const dx = (end[0] - start[0]) / steps;
                    const dy = (end[1] - start[1]) / steps;

                    const moveStep = (step) => {
                        if (!this.isMoving || currentSession !== this.currentMoveSession) {
                            this.stopCharacter($character, currentSession !== this.currentMoveSession);
                            return; // Stop if the flag is false
                        }

                        if (step <= steps) {
                            const x = start[0] + dx * step;
                            const y = start[1] + dy * step;
                            const direction = getDirection(dx, dy);
                            const frameOffsets = Game.instance.data['HERO/' + direction + '.gif'].frameOffsets;

                            if (currentDirection != direction) {
                                $character.hide();
                                $character = $(".hero[direction=" + direction + "]");
                                if (direction == 'LEFT') this.position.left += Math.floor(frameOffsets[0][0] * scaleFactor)
                                currentDirection = direction;
                                counter = 0;
                            }

                            const offsetX = frameOffsets[counter][0] * scaleFactor;
                            const offsetY = frameOffsets[counter][1] * scaleFactor;

                            this.position.left = Math.floor(x - offsetX);
                            this.position.top = Math.floor(y - offsetY);

                            let zidx = this.inForegroundBox(this.position.left, this.position.top) ? '9' : '6';

                            $character.css({
                                left: this.position.left + 'px',
                                top: (this.position.top - this.height) + 'px',
                                'z-index': zidx
                            }).show();

                            this.animations[currentDirection].move_to(counter);

                            setTimeout(() => moveStep(step + 1), 100);
                        } else {
                            index++;
                            updatePosition();
                        }
                    };
                    moveStep(1);
                } else {
                    this.processQueue(path);
                }
            };

            const updateCounter = () => {
                if (!this.isMoving || currentSession !== this.currentMoveSession) return; // Stop if the flag is false or session is outdated
                let maxFrames = this.animations[currentDirection].get_length();
                counter = (counter + 1) % maxFrames;
                setTimeout(updateCounter, SPEED * 100);
            };

            updateCounter();
            updatePosition();
        };

        moveImage(path, 20 / SPEED); // 10px per second
    }

    // Method to stop the movement
    stopMovement() {
        this.isMoving = false;
        this.moveQueue = []; // Clear the queue
        $(".path").remove()
    }

    // Method to stop the character and set it to STOP state
    stopCharacter(_character, isNextSession = false) {
        //console.log("stop movement", isNextSession);
        if (!_character) $('.hero:not([direction=STOP])').hide()
        else _character.hide();

        if (!isNextSession) this.showCharacter();
    }


    inForegroundBox(x, y) {
        let inBox = false;
        if (Screen.instance.foregroundAreas) _.each(Screen.instance.foregroundAreas, (box) => {
            if ((x >= box.left) && (x <= box.right) && (y >= box.top) && (y <= box.bottom)) inBox = true;
        })
        return inBox;
    }

    findPath(fromX, fromY, toX, toY) {
        let path = Screen.instance.paths.finder.findPath(fromX, fromY, toX, toY, Screen.instance.paths.grid.clone())
        //console.log(fromX, fromY, toX, toY, path)
        return PF.Util.smoothenPath(Screen.instance.paths.grid.clone(), path)
    }

    findPathTo(toX, toY) {
        let pathScale = Screen.instance.scaleFactor / 0.5
        // for performance reason this is downscaled, in screen load, getevent and find path
        let fromXW = Math.floor(this.position.left / pathScale),
            fromYW = Math.floor(this.position.top / pathScale),
            toXW = Math.floor(toX / pathScale),
            toYW = Math.floor(toY / pathScale)

        let { x, y } = this.findNearestWalkablePoint(fromXW, fromYW)
        let { x: x2, y: y2 } = this.findNearestWalkablePoint(toXW, toYW)

        console.log("Finding path ", x, y, x2, y2)
        return _.map(this.findPath(x, y, x2, y2), (coords) => [Math.floor(coords[0] * pathScale), Math.floor(coords[1] * pathScale)])
    }

    findNearestWalkablePoint(x, y) {
        if (Screen.instance.paths.grid.isWalkableAt(x, y)) return { x, y };

        const maxDistance = 10;
        const directions = [
            { dx: 0, dy: 1 },   // down
            { dx: 0, dy: -1 },  // up
            { dx: -1, dy: 0 },  // left
            { dx: 1, dy: 0 },   // right
        ];

        for (let distance = 0; distance <= maxDistance; distance++) {
            for (let { dx, dy } of directions) {
                const newX = x + dx * distance;
                const newY = y + dy * distance;
                if (Screen.instance.paths.grid.isWalkableAt(newX, newY)) {
                    return { x: newX, y: newY };
                }
            }
        }
        return { x, y }; // If no walkable point is found, return the original point
    }

    drawPathLine(coordinates) {
        $(".path").remove()
        const canvas = $('<canvas class="path">').attr({ width: $('.screen').width(), height: $('.screen').height() });
        $('.screen').append(canvas);

        const ctx = canvas[0].getContext('2d');
        ctx.beginPath();
        ctx.moveTo(coordinates[0][0], coordinates[0][1]);
        for (let i = 1; i < coordinates.length; i++) {
            ctx.lineTo(coordinates[i][0], coordinates[i][1]);
        }
        ctx.strokeStyle = '#CCC1';
        ctx.setLineDash([30, 5]);
        ctx.lineWidth = 10;
        ctx.stroke();
    }


    loadSavedGame() {
        const savedGameCookie = $.cookie("character");
        if (savedGameCookie) {
            try {
                return JSON.parse(savedGameCookie);
            } catch (error) {
                console.error("Failed to parse saved game data:", error);
            }
        }
        return null;
    }

    cleanSavedGame() {
        $.removeCookie("character")
    }

    clean() {
        this.cleanSavedGame();
        window.location.reload()
    }

    static get instance() {
        if (!Character._inst) {
            Character._inst = new Character();
        }
        return Character._inst;
    }

    clearActions(keepTimer = false) {
        if (keepTimer && this.actions.timer) {
            let timer = _.clone(this.actions.timer)
            this.actions = { timer: timer };
        }
        else {
            this.actions = {};
            $.cookie("character", JSON.stringify(this))
            console.log("Data stored into a cookie")
        }
    }


    actionInProgress() {
        // Return true if actions is not empty and contains keys other than timer
        if (!_.isEmpty(this.actions) && !(Object.keys(this.actions).length === 1 && this.actions.hasOwnProperty('timer'))) {
            return true;
        }
        return false;
    }


    // find path
    //https://github.com/qiao/PathFinding.js?tab=readme-ov-file

    updateState(actionData) {
        if (actionData) actionData.forEach(action => {
            const actionType = _.keys(action)[0];
            const actionPayload = action[actionType];
            console.log('Initializing', actionType, actionPayload)

            switch (actionType) {
                case 'setacif': { // set used flag if used
                    const { when, what } = actionPayload;
                    if (isUsed(when)) setUsed(what, true);
                    break;
                }
                case 'destacif': { // remove used flag is used
                    const { when, what } = actionPayload;
                    if (isUsed(when)) setUsed(what, false);
                    break;
                }
                case 'destacp': { // remove used flag if picked
                    const { when, what } = actionPayload;
                    if (isPicked(when)) setUsed(what, false)
                    break;
                }
                case 'char': {
                    const { charIf, chWhat, chTo } = actionPayload;
                    if (isUsed(charIf)) switchArea(chWhat - 1, chTo - 1);
                    break;
                }
            }
        });
    }

}


const inInventory = (what) => -1 == _.findIndex(Character.instance.inventory, ['item', what])

const setUsed = (what, isUsed = true) => {
    console.log("Setting", what, " used to", isUsed)
    if (what < AREA_NOT_ITEM) {
        const item = _.find(Character.instance.items, { item: what });
        if (item) item.isUsed = isUsed;
    } else {
        const area = _.find(Character.instance.areasUsed, { area: what - AREA_NOT_ITEM });
        if (area) area.isUsed = isUsed;
        else Character.instance.areasUsed.push({ area: what - AREA_NOT_ITEM, isUsed });
    }
};


const isUsed = (when) => {
    if (when < AREA_NOT_ITEM) return _.some(Character.instance.items, { item: when, isUsed: true });
    else return _.some(Character.instance.areasUsed, { area: when - AREA_NOT_ITEM, isUsed: true });
};

const isPicked = (when) => _.some(Character.instance.items, { item: when, isPicked: true });

const setPicked = (pick) => {
    let what = pick.pickWhat;
    let itm = _.find(Character.instance.items, ['item', what]);
    if (itm) itm.isPicked = true;
    else Character.instance.items.push({ item: what, isPicked: true });
};

const addToInventory = (pick) => {
    let what = pick.pickWhat;
    Character.instance.inventory.push({ item: what });
    delete Character.instance.actions.pick;
    InventoryView.instance.show();
    if (!isPicked(what)) setPicked(pick);
};

const removeFromInventory = (itemId, setUsed = false) => {
    // Find the index of the item in the inventory
    const itemIndex = Character.instance.inventory.findIndex(item => item.item === itemId);

    if (itemIndex !== -1) {
        // Remove the item from the inventory array
        Character.instance.inventory.splice(itemIndex, 1);

        if (setUsed) {
            // Find the item in the items array and set isUsed to true
            const characterItem = Character.instance.items.find(item => item.item === itemId);
            if (characterItem) {
                characterItem.isUsed = true;
            } else {
                // If the item is not in the items array, add it with isUsed set to true
                Character.instance.items.push({ item: itemId, isUsed: true });
            }
        }

        // Update the inventory display
        InventoryView.instance.show();
    } else {
        console.log(`Item with id ${itemId} not found in inventory.`);
    }
};
