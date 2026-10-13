/* ------------------------------------------------------------------
   All rule content lives here. Edit this file; every design reads it.
   Block types: p, list, steps, cards, points, callout
   Card colors: red | yellow | green | blue | wild | spicy
------------------------------------------------------------------- */
window.RULES = {
  uno: {
    label: "Uno",
    eyebrow: "Official rules",
    title: "UNO",
    tagline: "Be the first to empty your hand. Shout it when you're down to one.",
    meta: [
      { k: "Players", v: "2–10" },
      { k: "Cards", v: "108" },
      { k: "Ages", v: "7+" }
    ],
    sections: [
      {
        id: "goal",
        title: "The Goal",
        blocks: [
          { type: "p", text: "Get rid of all your cards before anyone else does. When you're down to one card, you must yell “UNO!”" },
          { type: "p", text: "Play a single round for fun, or keep score over several rounds. The first player to reach 500 points wins the game." }
        ]
      },
      {
        id: "setup",
        title: "Setup",
        blocks: [
          { type: "list", items: [
            "Everyone draws a card; the highest number deals. (Action cards don't count.)",
            "Shuffle and deal 7 cards to each player.",
            "Put the rest face-down as the draw pile. Flip the top card to start the discard pile.",
            "Play goes clockwise, starting with the player to the dealer's left."
          ]},
          { type: "callout", title: "If the starting card is an action card", text: "Wild Draw Four goes back into the deck, so flip another. Wild: first player picks the color. Skip: first player is skipped. Reverse: the dealer plays first, going counter-clockwise. Draw Two: first player draws 2 and loses their turn." }
        ]
      },
      {
        id: "turn",
        title: "Taking a Turn",
        blocks: [
          { type: "steps", items: [
            "Match the top card of the discard pile by <b>color</b>, <b>number</b>, or <b>symbol</b>.",
            "Or play a <b>Wild</b> card. Those fit anywhere.",
            "No match? <b>Draw one card</b> from the pile. If it's playable, you may play it right away.",
            "Can't play it? Your turn ends and play passes on."
          ]}
        ]
      },
      {
        id: "actions",
        title: "Action Cards",
        blocks: [
          { type: "cards", items: [
            { name: "Skip", sym: "⊘", color: "red", desc: "The next player loses their turn." },
            { name: "Reverse", sym: "⇄", color: "yellow", desc: "Play switches direction. With 2 players, it works like a Skip." },
            { name: "Draw Two", sym: "+2", color: "green", desc: "The next player draws 2 cards and loses their turn." },
            { name: "Wild", sym: "★", color: "wild", desc: "Play it on anything and choose the next color." },
            { name: "Wild Draw Four", sym: "+4", color: "blue", desc: "Choose the next color; the next player draws 4 and loses their turn. Only playable if you have no card matching the current color." }
          ]}
        ]
      },
      {
        id: "wd4",
        title: "Challenging a Wild Draw Four",
        blocks: [
          { type: "p", text: "You may only play Wild Draw Four when you hold no card of the <b>current color</b> (other Wilds and matching numbers or symbols don't count). The player it's played on may challenge it:" },
          { type: "steps", items: [
            "The challenged player shows their hand to the challenger.",
            "<b>Caught bluffing?</b> They draw the 4 cards instead.",
            "<b>Played legally?</b> The challenger draws 6 cards instead of 4, and still loses their turn."
          ]}
        ]
      },
      {
        id: "uno",
        title: "Saying “UNO”",
        blocks: [
          { type: "p", text: "When you play your second-to-last card, say “UNO!” If another player catches you with one card <b>before</b> the next player takes their turn, you draw 2 cards as a penalty." },
          { type: "p", text: "Going out with a Draw Two or Wild Draw Four? The next player still has to draw those cards, and they count toward your score." }
        ]
      },
      {
        id: "scoring",
        title: "Scoring",
        blocks: [
          { type: "p", text: "When a player goes out, they score the value of every card left in their opponents' hands:" },
          { type: "points", items: [
            { label: "Number cards (0–9)", pts: "Face value" },
            { label: "Draw Two, Reverse, Skip", pts: "20" },
            { label: "Wild, Wild Draw Four", pts: "50" }
          ]},
          { type: "callout", title: "First to 500 wins", text: "Keep a running total across rounds. The first player to reach 500 points wins the game." }
        ]
      },
      {
        id: "house",
        title: "Popular House Rules",
        blocks: [
          { type: "p", text: "These aren't in the official rulebook, so agree on them before you deal." },
          { type: "list", items: [
            "<b>Stacking:</b> answer a Draw Two with another Draw Two, passing the penalty along.",
            "<b>Jump-in:</b> play an identical card (same color and number) out of turn.",
            "<b>7-0:</b> playing a 7 swaps hands with someone; a 0 passes everyone's hand around.",
            "<b>Draw to match:</b> keep drawing until you get a playable card."
          ]}
        ]
      }
    ]
  },

  spicy: {
    label: "Spicy",
    eyebrow: "House rules",
    title: "SPICY UNO",
    tagline: "Regular Uno, plus some number-card chaos, jump-ins, and big stacks.",
    meta: [
      { k: "Players", v: "2–10" },
      { k: "Cards", v: "108" },
      { k: "Heat", v: "🌶🌶🌶" }
    ],
    sections: [
      {
        id: "overview",
        title: "What Makes It Spicy",
        blocks: [
          { type: "p", text: "Spicy Uno is regular Uno with extra rules layered on top. Everything on the <b>Uno</b> tab still applies unless it's changed here." },
          { type: "list", items: [
            "Four number cards (0, 1, 6, 7) now do something.",
            "You can <b>jump in</b> out of turn with an identical card.",
            "Draw cards <b>stack</b>, with a few restrictions.",
            "Stuck? <b>Draw until you can play</b>, or ask the table for a bailout.",
            "<b>Wild Draw Four is unrestricted.</b> Play it anytime, even if you have a matching color, and it can't be challenged.",
            "<b>Spice it up.</b> Sneaky moves are encouraged. See below."
          ]}
        ]
      },
      {
        id: "numbers",
        title: "Power Numbers",
        blocks: [
          { type: "p", text: "Whenever one of these is played, in <b>any color</b>, its effect happens:" },
          { type: "cards", items: [
            { name: "0: Pass the Hand", sym: "0", color: "blue", desc: "<b>Required.</b> Everyone passes their whole hand to the next player in the direction of play." },
            { name: "1: Trade Offer", sym: "1", color: "green", desc: "The player who plays the 1 has the option to pick anyone to swap hands with. They can pause play to decide, but only for a few seconds." },
            { name: "6: Slap!", sym: "6", color: "red", desc: "Everyone slaps the table. The <b>last</b> person to slap draws 1. <b>False slap?</b> Slap when it isn't a 6 (even if someone baited you) and you draw 1 too." },
            { name: "7: Silence", sym: "7", color: "yellow", desc: "No talking until the next 7. Speak and you draw 1. The house decides what counts as talking." }
          ]},
          { type: "callout", title: "Back-to-back 1s", text: "If 1s are jumped in on or played in quick succession, <b>every 1 gets its trade</b>, in the order they were played. Optional twist: a newer 1 <b>nullifies</b> an older one if that older player hasn't decided on a trade yet." }
        ]
      },
      {
        id: "jump",
        title: "Jump-In",
        blocks: [
          { type: "p", text: "If someone plays a card and you hold the <b>exact same card</b> (same color and same number or symbol, like a green 7 on a green 7), you can slam yours down out of turn." },
          { type: "list", items: [
            "Play continues from <b>you</b>. Everyone between the original player and you is skipped.",
            "Power numbers still trigger when jumped in on.",
            "Jumping in on a +2 or +4 stack works differently. See Stacking."
          ]}
        ]
      },
      {
        id: "stacking",
        title: "Stacking +2/+4",
        blocks: [
          { type: "p", text: "When a draw card is played against you, don't draw yet. Pass it along by stacking another one on top, and <b>the total keeps growing</b>: a +2 then a +4 makes 6, and another +4 makes 10. The first player who can't (or won't) stack draws the whole total." },
          { type: "points", items: [
            { label: "+2 on a +2", pts: "✓ Yes" },
            { label: "+4 on a +2", pts: "✓ Yes" },
            { label: "+4 on a +4", pts: "✓ Yes" },
            { label: "+2 on a +4", pts: "✗ No" }
          ]},
          { type: "callout", title: "Anyone can jump in", text: "You don't have to be next in line. If a +2 is played, a player three seats away can jump in with their own + card. It doesn't need to match the card played, as long as it follows the table above. The stack passes to the player after them. Anyone skipped in between is off the hook." },
          { type: "callout", title: "Any color works", text: "Once a draw card is out, your stacking card doesn't need to match its color." }
        ]
      },
      {
        id: "stuck",
        title: "When You Can't Play",
        blocks: [
          { type: "p", text: "If you have nothing playable at the start of your turn, pick one:" },
          { type: "steps", items: [
            "<b>Draw until you can play.</b> Keep drawing until you get a playable card, then play it. This is on the honor system.",
            "<b>Ask for a bailout.</b> Ask the other players to hand you a card. They're allowed to lie about what they have."
          ]},
          { type: "callout", title: "Your turn keeps going", text: "A bailout just means one more card in your hand. If someone lied to you, you can still draw and take more bailouts until you can play." },
          { type: "callout", title: "Bailout rules", text: "Cards given as a bailout must be passed <b>face down</b>. A card handed over face up doesn't count, so that player can't help you. <b>No take-backs:</b> once you fully grab a bailout card, you must keep it, even if you haven't looked at it or turned it over yet." }
        ]
      },
      {
        id: "calling",
        title: "Calling UNO",
        blocks: [
          { type: "p", text: "Same as regular Uno, with a few wrinkles:" },
          { type: "list", items: [
            "<b>During a 7:</b> you can't say it, so raise a finger instead. Other players can raise a finger to call you out, too. If anyone says “UNO” out loud, it still counts as a call, but they draw 1 for speaking.",
            "<b>After a hand swap:</b> if a 0 or 1 leaves someone with one card, that player has to remember to call UNO themselves."
          ]}
        ]
      },
      {
        id: "sneaky",
        title: "Spice It Up",
        blocks: [
          { type: "p", text: "Spicy Uno rewards a sharp eye and quick hands. If you spot an opening, take it. For example:" },
          { type: "list", items: [
            "Someone leaves the table? Look at their hand, and <b>take a card</b> you like.",
            "Fake a slap to bait someone into a false slap.",
            "Lie when someone asks you for a bailout.",
            "Jump in the second you see a match."
          ]},
          { type: "callout", title: "Don't get attached", text: "You probably won't end up with the cards you started with anyway." }
        ]
      },
      {
        id: "winning",
        title: "Winning",
        blocks: [
          { type: "p", text: "Same as regular Uno: empty your hand first. Scoring and the 500-point game work the same way too." },
          { type: "callout", title: "Last card rule", text: "If your last card is a 0, 1, 6 or 7, its effect <b>does not happen</b>. You just win." }
        ]
      }
    ]
  }
};
