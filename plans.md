# Duǒshǎn 躲闪
## Elite Dodgeball

## Project Overview
- **Concept:**
A first and third person dodgeball game that behaves like an arena shooter, but with physics based dodgeballs instead of guns. The arenas are varied- and like real dodgeball they all have a centerline which cannot be crossed, but Duoshan experiments with dynamic shifting lines and shapes. Balls are also varied, keeping the game fresh.
- **Vision:**
An exciting skill-based shooter requiring timing, movement, and planning. More "Mordhau" or "Chivalry" than "Call of Duty". 
- **Target platforms:**
Runs online, with and without an account.
- **Target audience:**
Ultimately the goal is producing something students at my school want to play instead of crappy ad-ridden web games. Should be fun for adults as well.

## Goals and Success Criteria
- **Player goals:**
Knock out all the players on the other team. Dodgecoins are earned throughout the games and can be used to buy player skins 
- **Project goals:**
A lightweight game that runs in browser, and gets players into a game fast. Includes bots, but only until there are 6 players in a round. The goal is a better, ad-free, low latency 'Shell Shockers' or 'Boxels', but without guns, and with physics. 
- **Success measures:**
The game is fun, and a hit at school.

## Core Gameplay
- **Game modes:**
- Classic: The primary game type, standard dodgeball rules apply. Classic FPV: Same rules as classic, but players cannot toggle to third person, changing the dynamic. Ultimate: a last-man standing variant with a unique map.

- **Rules and objectives:**
Classic rounds are won when a team is fully knocked out. Players that have been knocked out can spawn again when a teammate catches a ball. Catching a ball knocks the thrower out. Ultimate is different, with players respawning 6 seconds after being knocked out throughout the game. Players who cross the centerline are knocked out automatically and drop any carried balls.

- **Dodgeball mechanics:**
Standard ball: The classic red dodgeball. Can be caught, blocked and thrown without a change to physics. Knockout impact to players only causes them to ragdoll- not react from the impact. A bounced impact just bounces off players if not grabbed. Moderate speed, moderate parabola, moderate bounce. Ball turns light red after a bounce to indicate they are harmless.
Speed ball: An orange ball. Catching and blocking are slightly jarring, due to greater speed. A bounce turns light orange. A bounced ball that retains speed can cause players to trip if impacting legs when sprinting or jumping, and can push players slightly if they are more stable. A fast bounce to the head can knock players down, but not out. Once speed drops to standard levels it bounces harmlessly off players. Throws are faster and more accurate if aimed, but less accurate if not aiming.
Heavy ball: A blue ball that takes twice as long to throw and travels slower than standard, with a more extreme parabola and less distance. However, it cannot be blocked or caught due to weight. Has a dramatic impact to players, with the ragdoll effect being comical. Players can faceplant, twirl around, or be flipped up and over if impacted in the head. Blocking with the heavy ball takes longer to wind up. Heavy balls barely bounce. Players can trip over them if they walk, slide, or sprint over the ball.


- **Player abilities and progression:**
Players have a limited sprint, short jump, duck, and can sprint crouch to slide. Player characters have ragdoll physics, and this will be a core and hilarious discovery for players. Players colliding with each other can trip and fall, as well as if they sprint into a wall or over a ball. Players left click to pick up a ball, and can left click and hold to try and catch a ball in the air. Dodgeballs may be caught if the player clicks and holds at the right time while also aiming looking at the ball. Players can throw the ball by left clicking, which is a basic throw- and takes a moment to wind up and release. Players can hold left click for 1.2 seconds to reduce the spread, but not to a pinpoint. They may tap right mouse to block a ball, with the same timing/proximity as catching. Throws, blocks, and catches may occur during all movement states, but not when tripped and recovering. 

Players earn points for assists, dodges (thrown balls passing close to them) catches, blocks, knocking out other players, wins, and special knockouts- IE while sliding, while airborne, double-knockouts, first knockout, bounce-outs (if an opposing player is knocked out by a stray bounced/blocked ball)

- **Match length and pacing:**
Matches last for 10 minutes or until a team wins 4/7 rounds. An 'Ultimate' match is up to 10 minutes.

## Multiplayer
- **Player count and team structure:**
Classic is up to 8v8, Ultimate rounds up to 8. Players who join during a game are assigned to the lowest player-count team and cannot switch teams. 

- **Matchmaking and parties:**
Pre-match lobbies allow for players to swap teams to be with friends. Games have individual codes and urls to share with friends to invite them to the session. 

- **Online/local play:**
Play is online, but a practice mode with bots can be one person only.

- **Social and competitive features:**
In-game chat and proximity voice chat should be available. Ideally the pre-game lobby allows players to run around and talk to others, akin to Fortnite. They can show off skins and practice movement. 

I need to be able to access account signups and manually change account names if needed. (To ensure appropriateness). I also need to have chat records logged if any banned words are typed. IE- a player types something inappropriate. The chat blocks that specific word, changing it to the word 'NOPE', but also records the chat message and all the rest of the messages in that round. I will issue warnings and bans as needed. 

Players who have not made an account can *see* chat, but if they try to send a message or use voice chat they are told that they have to make an account first. Making an account will require email, name, and password. We'll write a 'code of conduct' that has to be read before completing signup. We'll also outline how data is used- which is ONLY for communicating with players if needed, and allowing them to recover an account. Nothing will ever be sold. 

## Content and Style
- **Setting and themes:**
Modern school gym, high-tech gym space, outdoor court in a neighborhood, and a bigger city block arena for the ultimate game mode. 

- **Characters and customization:**
Players who have not made an account spawn with a basic uniforms and random skin color. Players who have made accounts access 1 bonus uniform at first, and can use earned Dodgecoins to buy more as released. I will create all special uniforms. Free-for-all mode is played with the exact uniform as shown in menu. In classic modes players on your team will have a blue outline, and the other team have a bright red outline. 

Players who log in can choose body type 1 or 2 (male or female), choose between a few hair styles, skin colors, and hair colors. Faces are pixelated, but offer a few choices for players, and they also change dynamically when blocking, throwing, catching, or being knocked out. 

- **Arenas:**
Classic gym with a centerline, Hypergym- featuring a more dynamic line with some obstacles and ramps- to run over and sneak behind. Neighborhood- an outdoor arena with a inflatable cover that can be pushed around or knocked out of bounds by heavy balls. (And used to knock players down if hiding behind them). Ultimate: A free-for-all space without impassable centerlines.

- **Visual direction:**
Design of characters is closely based on the appearance of characters in 'Teardown', like Minecraft, but with more accurate dimensions, joints, and hands. Bright colors, limited geometry, 

- **Audio direction:**
Funny. We can use midi and placeholder sounds at first, but I will record balls in the gym and my own sound effects shortly after the game is playable, and before we go properly live. (Adding links to the game around my domain)

## Technical and Operations
- **Technology and networking:**
To be completed- ask me about this. 

- **Accessibility and localization:**
Must be playable in mainland China- but we are not building a multi-lingual game. 

- **Monetization:**
No monetization, HOWEVER, I want to have the framework in place to add in menu and in-game image 'ads', where I can add school messages for students, or advertise resources on my site. It would be genuinely hilarious to be able to place 'sponsor' banners in the arenas to remind students of dress code, device rules, or that they have a test tomorrow. 

- **Launch and ongoing support:**
We need to be able to add new arenas, new skins, and new balls in time. Accounts must not be affected by this unless we choose to give them free materials. 

## Scope and Plan
- **Must-have features:**
Physics, low-latency online play.

- **Out of scope:**
Future expansions.  

- **Milestones and timeline:**
To be assessed by you.

- **Risks and open questions:**
To be assessed by you.