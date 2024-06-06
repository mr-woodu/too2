// Singleton for current screen
class Game {
    constructor() {
        this.data = {};
    }

    static get instance() {
        if (!Game._inst) {
            Game._inst = new Game();
        }
        return Game._inst;
    }
}


// Initialize game on document ready
$(() => {
    Character.instance.loadCharacterAnim()

    const START_GAME = $.cookie("character")
        ? ""
        : "Tohle byl první nástřel hry Tajemství Oslího Ostrova 2<br> z roku 1995 která se bohužel nigdy nedotáhla :(<br><br>Ale zkusit dostat kapitána z vjezení stejně zkusit můžeš.<br><br><a href='#'>začni tady</a><small><br><br><i>Reconstructed by Woodu and GPT4o in 2024</i></small>"
    $(".loader").css({ 'z-index': '9000', padding: '50px' }).html(START_GAME);
    $(".loader a").click((e) => { e.preventDefault(); $(".loader").css({ 'z-index': '-2' }).html(""); });

    $("#debug-hack").click((e) => { e.preventDefault(); $(".menu,#debug").toggle() })

    fetch("data/anim.json")
        .then(response => {
            if (!response.ok) {
                throw new Error("Network response was not ok. Status code:", response.status);
            }
            return response.json();
        })
        .then(jsonData => {
            console.log(jsonData);
            Game.instance.data = jsonData;

            let keys = _.keys(jsonData);
            let screens = _.sortBy(_.uniq(_.map(_.filter(keys, k => k.includes("SCREENS")), k => k.split("/")[1])));

            screens.forEach(scr => $(`<li class="nav-item"><a class='nav-link' id='${scr}' href='#${scr}'>${_.capitalize(scr)}</a></li>`).appendTo($(".menu ul")));
            $('<a class="badge m-1 text-bg-secondary" href="#" onclick="Character.instance.clean()">Clean all</a>').appendTo($(".menu"));

            $(".inventorybox").css({
                transform: `scale(${Screen.instance.scaleFactor}, ${Screen.instance.scaleFactor})`,
                transformOrigin: 'bottom left'
            });

            $(".info").css({ bottom: INFO_BOTTOM * Screen.instance.scaleFactor });
            $(".info").css({ bottom: INFO_BOTTOM * Screen.instance.scaleFactor });

            $(".menu li a").on('click', (e) => Screen.instance.load($(e.currentTarget).attr('id'), true));
            $(`.menu li a[id=${Character.instance.currentScreen}]`).click();

            Animation.instance.handleBaseAnimations(Screen.instance, Character.instance);
            EventHandler.instance.handleMouseEvents(Screen.instance, Character.instance);
        });
});

/*
    
    talk to pirate in pub -> enable interaction with jailed captain
    talk to hospodsky few times
    talk to jailed captain
    talk to vetesnik about whatever
    talk to hospodsky about vodka

    pick hadr
    pick tyc
    you can pick mapa if you want ;-)

    remove plank from plot
    go to zavetesnictvim

    go to vetesnik, klick on ptak
    pick klice ;-)

    in sklep -> put hadr in sink, tap kohoutek, leave

    go in front of vetestnistvi (there is water)
    leave and get back, you can go to empty vetesnik


    DONE



    OSEL ->
        click enables osel map (301)
        301: pick map (3)

    SROT:
        6:      pick (5) tyc

    SKLEP ->
        2:      use (HARD/2) and ucpi umyvadlo
        2/260:  if umyvadlo, set water dripping

    PREDHOSP and MEZIOBR1
        263/264: set ac if 263 -> 264 (clear water predvetes)

    ZAHOSP (after talking to hospodsky and vetesnik you can go thru)
        2:          pick (2/HADR) 
        257:        if (257/ 2nd talk to hospodsk) - char if 4 => 13 (enable planka)
        258/6       use tyc on planka and get access ZA VETES

    HOSPODA
        TODO: improve sequence of dialogues
        // SHOULD DO SOMETHING THA WILL DO CHARIF(xx, 9,19) to switch hospodsky to talk about vodka molotov
        255:        after talk to pirat (enables KAPITAN interaction in VEZENI)
        256:        char if (256/talked to capitan) 9 => 19 switchArea(8,18) so I can talk about VODKA
        257:        talk to hospodsky ABOUT VODKA, enable interaction za hospodou ...
        265:        pick vodka na molotov           /// THIS DOESN"T EXISTS NOW CHARIF(14,21)
        300:        get drink from hospodsky, enable dialogue

    VETESNIK
        257:        char if (257) 16 -> 20 (enable papousek) switchArea(15,19)
        258:        after talk to vetesnik char 14 -> 18 switchArea(14, 18)         ideally 13 -> 16( and change klice on load if 259?)
        259:        can click papousek, and distract vetesnik ;-) --> set 263
        262:        when clicked on papousek, FOR TIME ONLY, can pick klice ...

    ZAVETES
        0/259:      set ac if 0 => 259 (so i can interact with papousek)
        260/261:    set ac if 260 => 261 (i open kohutek and left sklep)
        7:          use (7/klice) to get to sklep
        261:        if (261) can not go to sklep

    PREDVETES
        260:        if (260) show voda
        7/257:      deset ac p 7 - > 257 (if 7/KEYS) disable 257
        261/263:    set ac if 261 => 263 (i have visited pred vetesnictvim s vodou)
        264:        deset ac if 264 => 263, 260
        264:        char if 264 => 4 to 15 (door leads to VETES2) switchArea(3,14) 
    
    VETESNIK2
        1:          MSN (pick maxuv super nastroj) && GAME OVER

    VEZENI
        255:        char if (talked to pirat) 5 -> 12 (okno s kapitanem) switchArea(4,11)
        264/0:      char if (don't knoiw) change 7 -> 14 (rybar) switchArea(6,13) 
        9:          if I have molotov I can use it on Rybar && GAME OVER


    SCREENS/VETESNIK/LEVEL5/LEVEL maxtalk on 1

*/



// Constants
const AREA_NOT_ITEM = 255;
const INVENTORY_LEFT = 52;
const INVENTORY_TOP = 426;
const INVENTORY_ITEM_SIZE = 71;
const INFO_BOTTOM = 73;

const MISSING_ACTION_ITEM = "Něco mi asi chybí ..."
const MISSING_PICK_OPTION = "Teď to nepůjde ..."
const CANT_EXIT = "Tam teď nemůžu .."
const INVENTORY_ITEMS = [
    { name: "trubka", itemId: 1 },
    { name: "špinavý hadr", itemId: 2, useWith: 4, changeTo: 9 },
    { name: "Atumijská mapa", itemId: 3 },
    { name: "flaška chalstu", itemId: 4, useWith: 2, changeTo: 9 },
    { name: "pánská ochrana", itemId: 5 },
    { name: "tyč", itemId: 6 },
    { name: "svazek klíčů", itemId: 7 },
    { name: "Maxův supernástroj", itemId: 8 },
    { name: "molotov coctail", itemId: 9 }
];

let timeoutId = {};
