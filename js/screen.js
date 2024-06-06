// Singleton for current screen
class Screen {
    constructor() {
        this.animation = Animation.instance;
        this.character = Character.instance;
        this.game = Game.instance;
        this.events = EventHandler.instance;
        this.scaleFactor = 1;
        this.areas = {};
        this.paths = {};
        this.areaDetails = [];
        this.areaMap = {} // re-mapped areas 
        this.descriptions = [];
        this.dialogues = [];
        this.screenPos = { left: 0, top: 0 };

        this.scaleFactor = $('.screen').height() / 480;
    }

    static get instance() {
        if (!Screen._inst) {
            Screen._inst = new Screen();
        }
        return Screen._inst;
    }

    load(screenName, isFirst = false) {
        console.log("Loading ", screenName);
        $(window).off('resize').on('resize', () => this.load(screenName));

        this.character.previousScreen = this.character.currentScreen || "NONE";
        this.character.currentScreen = screenName;
        if (!isFirst) this.character.clearActions();

        let _this = this

        function presentScreen() {
            $('.loader').css('z-index', 2000);
            $(".screen .animations").empty();
            $(".path").remove()

            _this.show(screenName);

            $(".menu .nav-link").removeClass("active")
            $(`.menu a[id=${screenName}]`).addClass("active")


            $(".talk>div, .desc>div, .info>div").hide();
            $(".bkg").attr("src", `data/SCREENS/${screenName}/BKG.png`);

            InventoryView.instance.show();
            _this.handleAllShown();
            if (!isFirst) $(".screen").fadeIn();
        }

        if (isFirst) presentScreen();
        else $(".screen").fadeOut(400, presentScreen);
    }

    show(screenName) {

        const originalWidth = 640;
        const originalHeight = 480;
        this.areas = this.decompressScreenArray(this.game.data[`SCREENS/${screenName}/BKG`].data, originalWidth, originalHeight, this.scaleFactor);
        this.paths = this.decompressScreenMatrix(this.game.data[`SCREENS/${screenName}/BKG_PATH`].data, originalWidth, originalHeight, 0.5); // for performance reason this is downscaled, in screen load, getevent and find path
        this.areaDetails = this.game.data[`SCREENS/${screenName}/BKG_ARS`];
        _.each(this.areaDetails, (area, idx) => this.areaMap[area.idx] = idx)

        this.descriptions = this.game.data[`TEXTS/${screenName}`];
        this.dialogues = this.game.data[`SCREENS/${screenName}/SCREEN`];
        this.foregroundAreas = _.map(this.game.data[`SCREENS/${screenName}/LEVEL3/FORE`], (box) => {
            return {
                left: Math.floor(box.back.left * this.scaleFactor),
                right: Math.floor(box.back.right * this.scaleFactor),
                top: Math.floor(box.back.top * this.scaleFactor),
                bottom: Math.floor(box.back.bottom * this.scaleFactor)
            }
        });


        let savedChanges = Character.instance.loadSavedGame()
        if (savedChanges && savedChanges.areaChanges)
            _.each(savedChanges.areaChanges[Character.instance.currentScreen], (areaTo, areaFrom) => { if (areaTo.chTo) switchArea(areaFrom, areaTo.chTo) });
        Character.instance.updateState(this.game.data[`SCREENS/${screenName}/ACTION`]);



        let exits = this.getIndexPositions(this.areaDetails);
        let maxX = this.areas.scaledWidth - 40;
        let maxY = this.areas.scaledHeight * 0.8 - 40;
        _.each(exits, ex => $(`<img src='exit.webp' style='position:absolute; width:40px; left:${Math.min(maxX, ex.x + 5)}px; top: ${Math.min(maxY, ex.y + 60)}px; z-index:10;opacity: 0.5;'>`).appendTo($(".screen .animations")));

        let baseAnimations = this.getBaseAnimations(screenName);
        let heroActions = this.getHeroActions(screenName);

        baseAnimations.concat(heroActions).forEach(ba => this.animation.loadAnimation(ba, this, this.game, this.character, this.events));

        // show character
        let positions = this.game.data[`SCREENS/${screenName}/SCREEN_INI`];
        let pastScreen = _.find(positions, ['from.screen', this.character.previousScreen])
        if (!pastScreen) pastScreen = _.find(positions, ['from.screen', 'NONE']);
        if (pastScreen) this.character.showCharacter({ left: pastScreen.from.startX, top: pastScreen.from.startY })
        console.log("Coming from", this.character.previousScreen, "to:", pastScreen ? pastScreen.from : "N/A")

    }

    handleAllShown() {
        if ($.cookie("character")) $('.loader').css('z-index', -2);
        return

        // to fix this some time in the future
        const allDrawn = $('.jsgif>canvas').toArray().every(canvas => $(canvas).attr('drawn') === 'true');
        if (allDrawn) {
            $('.loader').css('z-index', -2);
        } else {
            setTimeout(handleAllShown, 1000); // Check again after 100ms
        }
    }

    // Helper functions
    findIndexesWithExit(array) {
        return _.chain(array)
            .map((obj, index) => ({ obj, index }))
            .filter(item => _.has(item.obj, 'exit'))
            .map(item => item.index)
            .value();
    }

    findTopLeftPositions(areas, indexesWithExit) {
        const positions = {};

        indexesWithExit.forEach(index => {
            let found = false;

            for (let y = 0; y < areas.scaledHeight && !found; y++) {
                for (let x = 0; x < areas.scaledWidth && !found; x++) {
                    if (areas.data[y * areas.scaledWidth + x] - 2 === index) {
                        positions[index] = { x, y };
                        found = true;
                    }
                }
            }
        });

        return positions;
    }

    getIndexPositions(areaDetails) {
        const indexesWithExit = this.findIndexesWithExit(areaDetails);
        return this.findTopLeftPositions(Screen.instance.areas, indexesWithExit);
    }

    decompressScreenArray(compressed, width, height, scaleFactor) {
        const decompressed = [];

        for (let value of compressed) {
            if (value >= 1000) {
                const baseValue = value % 1000;
                const count = Math.floor(value / 1000);

                for (let i = 0; i < count; i++) {
                    decompressed.push(baseValue);
                }
            } else {
                decompressed.push(value);
            }
        }

        const scaledWidth = Math.floor(width * scaleFactor);
        const scaledHeight = Math.floor(height * scaleFactor);
        const scaledArray = new Array(scaledWidth * scaledHeight).fill(0);

        for (let y = 0; y < scaledHeight; y++) {
            for (let x = 0; x < scaledWidth; x++) {
                const originalX = Math.floor(x / scaleFactor);
                const originalY = Math.floor(y / scaleFactor);

                if (originalX < width && originalY < height) {
                    scaledArray[y * scaledWidth + x] = decompressed[originalY * width + originalX];
                }
            }
        }

        return {
            data: scaledArray,
            scaledWidth,
            scaledHeight
        };
    }

    decompressScreenMatrix(compressed, width, height, scaleFactor) {

        let data = this.decompressScreenArray(compressed, width, height, scaleFactor);

        // Calculate the number of rows
        const rows = data.data.length / data.scaledWidth;
        data.data = _.map(data.data, val => val == 0 ? 1 : 0)

        // Initialize an empty array to store the rows
        const arrayOfRows = [];

        // Loop through the flat array and split it into rows
        for (let i = 0; i < rows; i++) {
            // Get the start and end indices for each row
            const startIndex = i * data.scaledWidth;
            const endIndex = startIndex + data.scaledWidth;

            // Extract the row from the flat array
            const row = data.data.slice(startIndex, endIndex);

            // Push the row into the array of rows
            arrayOfRows.push(row);
        }

        delete data.data
        //data.matrix = arrayOfRows;
        data.grid = new PF.Grid(arrayOfRows);
        data.finder = new PF.BiAStarFinder({
            allowDiagonal: true,
            dontCrossCorners: true

        });

        return data
    }


    getBaseAnimations(screenName) {
        let baseAnimations = [];
        let keys = _.keys(Game.instance.data);
        let levels = _.reverse(_.sortBy(_.filter(keys, k => k.includes(`/${screenName}`) && k.endsWith("/LEVEL"))));
        levels.forEach(lvl => {
            Game.instance.data[lvl].forEach(config => {
                let anim = {
                    path: lvl.slice(0, -5),
                    zpos: lvl.slice(-7, -6),
                    name: config.name,
                    random: config.random,
                    time: config.time,
                    play: config.play
                };
                baseAnimations.push(anim);
            });
        });
        return baseAnimations;
    }

    getHeroActions(screenName) {
        let heroActions = [];
        let keys = _.keys(Game.instance.data);
        let actions = _.reverse(_.sortBy(_.filter(keys, k => k.includes(`/${screenName}`) && k.endsWith("/HERO"))));
        actions.forEach(lvl => {
            Game.instance.data[lvl].forEach((config, idx) => {
                let anim = {
                    path: lvl.slice(0, -4),
                    zpos: 0,
                    name: config.name,
                    play: { when: PLAY_CHARACTER_ACTION, what: idx + 1 }
                };
                if (config.loops) anim.loops = config.loops;
                heroActions.push(anim);
            });
        });
        return heroActions;
    }

}