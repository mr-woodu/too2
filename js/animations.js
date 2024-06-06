
const PLAY_WHEN_USED = 1;
const PLAY_WHEN_PICKED = 2;
const PLAY_NOT_USED = 3;
const PLAY_NOT_PICKED = 4;
const PLAY_IN_USE = 5;
const PLAY_CANNOT_EXIT = 6;
const PLAY_TALKING_TO = 7;
const PLAY_ON_TIMER = 8;
const PLAY_ON_EXIT = 9;
const PLAY_CHARACTER_ACTION = 10;


class Animation {
    constructor() {
        this.animationData = {};
    }

    static get instance() {
        if (!Animation._instance) {
            Animation._instance = new Animation();
        }
        return Animation._instance;
    }

    loadAnimation(ba, screenInstance, gameInstance, characterInstance, eventHandler) {
        let id = `${ba.path}${ba.name}.gif`;
        let path = `data/${id}`;
        if (!gameInstance.data[id]) {
            console.log(`${id} doesn't exist`);
            return;
        } //else console.log("loading", ba);

        let animId = `anim-${ba.name}-${ba.zpos}`;
        let pos = { x: gameInstance.data[id].offsetX, y: gameInstance.data[id].offsetY };
        let img = $(`<img rel:animated_src='${path}' xsrc='${path}' style='z-index:${ba.zpos}' class='anim ${ba.random ? 'random' : ''}' id='${animId}'>`);
        img.appendTo($(".screen .animations"));

        this.positionAnimation(animId, pos, ba, screenInstance.scaleFactor, characterInstance, screenInstance, gameInstance, eventHandler);
    }

    positionAnimation(id, pos, ba, scaleFactor, characterInstance, screenInstance, gameInstance, eventHandler) {
        var anim = $("#" + id);
        var newX = pos.x * scaleFactor;
        var newY = pos.y * scaleFactor;

        let canAutoPlay = !ba.play;
        let position = {
            display: this.animationVisibleNow({ base: ba }, characterInstance) ? 'inherit' : 'none',
            top: newY + 'px',
            left: newX + 'px',
            'z-index': 10 - parseInt(ba.zpos),
            transform: `scale(${scaleFactor}, ${scaleFactor})`,
            transformOrigin: 'top left'
        };
        if ((newX < 2) && (newY < 2)) position['border-radius'] = '20px 0 0 0';

        var rub = new SuperGif({
            gif: anim[0],
            auto_play: canAutoPlay,
            show_progress_bar: false,
            draw_while_loading: true,
            loop_mode: ba.loops ? false : true,
            max_width: anim.width() * scaleFactor,
            canvas_css: position,
            on_end: () => {
                if (ba.loops && ba.play && (ba.play.when == PLAY_CHARACTER_ACTION))
                    eventHandler.handleAnimationEnd(characterInstance, screenInstance, ba)
            }
        });

        rub.load(function (gif) {
            let canvas = rub.get_canvas();
            $(canvas).attr("anim-id", id);
            $(canvas).parent().attr("anim-id", id);
            Animation.instance.animationData[id] = { base: ba, gif: rub, isPlaying: canAutoPlay };
        });
    }

    handleBaseAnimations(screenInstance, characterInstance) {
        let characterShown = false;
        setInterval(() => {

            if (characterInstance.animations.STOP && !characterInstance.isMoving 
                && !characterShown && ($(`.hero[direction=STOP]`).length >0) && !characterInstance.actions.heroAnimId) {
                characterShown = true;
                characterInstance.showCharacter()
            }

            if (characterInstance.actions.heroAnimId) {
                $(`.hero[direction=STOP]`).hide();
                characterShown = false;
            }

            _.each(this.animationData, (anim, id) => {
                if (typeof anim.isPlaying === 'undefined')
                    anim.isPlaying = false;

                if (typeof anim.nextPlayTime === 'undefined')
                    anim.nextPlayTime = Date.now();

                let isStarting = (anim.gif.get_current_frame() === 0) || (anim.gif.get_playing() === false);
                if (!isStarting) return;

                if (!anim.isPlaying) {
                    let currentTime = Date.now();
                    let isVisible = this.animationVisibleNow(anim, characterInstance);
                    if (!isVisible) $(anim.gif.get_canvas()).hide();
                    else if (currentTime >= anim.nextPlayTime) {
                        anim.gif.play();
                        anim.isPlaying = true;
                        $(anim.gif.get_canvas()).show();
                    }
                } else if (anim.base.random) {
                    let currentTime = Date.now();
                    if (currentTime >= anim.nextPlayTime) {
                        anim.gif.pause();
                        anim.isPlaying = false;
                        anim.nextPlayTime = currentTime + (Math.floor(Math.random() * 30 * anim.base.random));
                    }
                } else if (anim.base.play) {
                    let isVisible = this.animationVisibleNow(anim, characterInstance);
                    if (!isVisible) {
                        $(anim.gif.get_canvas()).hide();
                        anim.gif.pause();
                        anim.isPlaying = false;
                    }
                }
            });
        }, 10);
    }

    animationVisibleNow(anim, characterInstance, isPlaying = true) {
        if (!anim.base || !anim.base.play) return true;
        let what = (anim.base.play.what < 255)
            ? _.find(characterInstance.items, ['item', anim.base.play.what])
            : _.find(characterInstance.areasUsed, ['area', anim.base.play.what - 255]);

        //if (anim.base.random && )

        switch (anim.base.play.when) {
            case PLAY_WHEN_USED:
                return (what && what.isUsed);
            case PLAY_WHEN_PICKED:
                return (what && what.isPicked);
            case PLAY_NOT_USED:
                return !(what && what.isUsed);
            case PLAY_ON_TIMER:
                return characterInstance.actions.timer && what && what.isUsed
            case PLAY_IN_USE:
                return characterInstance.actions.use && characterInstance.actions.use.useWhat == anim.base.play.what;
            case PLAY_NOT_PICKED:
                return !(what && what.isPicked);
            case PLAY_TALKING_TO:
                return (characterInstance.actions.talk) && (characterInstance.actions.talk.talkTo == anim.base.play.what) && (characterInstance.actions.speaker == 'X')
            case PLAY_CANNOT_EXIT:
                if (!characterInstance.actions.inExit) return true;
                return anim.base.play.what != characterInstance.actions.inExit.exit;
            case PLAY_CHARACTER_ACTION:
                return anim.base.play.what == characterInstance.actions.heroAnimId;
            case PLAY_ON_EXIT:
                if (!characterInstance.actions.inExit) return false;
                return anim.base.play.what == characterInstance.actions.inExit.exitAnim;
        }
        return false;
    }
}
