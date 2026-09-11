# Scripture Baseball

[My Notes](notes.md)

Scripture Baseball is an interactive web app in which players test their scriptural knowledge by playing a variety of single-player or multi-player games based on the Standard Works of The Church of Jesus Christ of Latter-day Saints. The basic game presents a random verse to the user, after which they attempt to guess the book and chapter in which that verse is found. 

### Elevator pitch

Are you a returned missionary who used to know exactly where to find a verse? Or do you just want to build stronger scripture knowledge?

Scripture Baseball helps you master the scriptures through simple, repeatable practice, on your own or with friends. Choose a book of scripture, get a verse, and see if you can identify where it comes from. Practice the books you know least, sharpen the ones you know best, or challenge your friends and put your scripture knowledge to the test.

### Design

#### Logged In:

![Logged In](assets/pictures/figma_logged_in.png)

#### Choose Your Book:

![Choose Your Book](assets/pictures/figma_choose_book.png)

#### In Game:

![In Game](assets/pictures/figma_in_game.png)

Here is a simple diagram showing a multi-player game:

![In Game Diagram](assets/pictures/scripture_baseball_multiplayer_simple_diagram.png)

### Key features

- Secure HTTPS login
- Ability to choose single-player and multi-player games
- Ability to choose which books to practice
- Multi-player displays scores and player choices in real-time
- Scores and streaks are persistently stored


### Technologies

I am going to use the required technologies in the following ways.

- **HTML** - Use correct HTML structure for each of the site's pages. The following pages will use HTML:
    - Logging in
    - Dashboard
    - Single-player game
    - Multi-player game
    - Account/settings
- **CSS** - CSS will be used to style the webpages and make them look good on different screen sizes. It will also be used for any coloring or animation within gameplay.
- **React** - React will be used to route the user to the various pages described above in the HTML section. It will be used to effectively modularize the code.
- **Service** - The following services will be employed:
    - Signup
    - Login
    - Open various pages while logged in
    - Connect to a game
    - Guess a book/chapter
    - Use of [Google Analytics](https://developers.google.com/analytics) as a third-party API to determine from what devices and in what general locations users are accessing the web app
- **DB/Login** - The database will store users, user information, scores, streaks, preferences, etc. in a database. Users must be logged in and authenticated to play the game.
- **WebSocket** - As players make a guess in a multi-player game, their guess is broadcasted to the other players. Websocket is also employed to notify users when it's their turn to play.

## 🚀 Specification Deliverable

For this deliverable I did the following. I checked the box `[x]` and added a description for things I completed.

- [x] I completed the prerequisites for this deliverable (Git commit requirement)
- [x] Proper use of Markdown
- [x] A concise and compelling elevator pitch
- [x] Description of key features
- [x] Description of how you will use each technology including your 3rd party API and use of WebSocket
- [x] One or more rough sketches of your application. Images must be embedded in this file using Markdown image references.

## 🚀 AWS deliverable

For this deliverable I did the following. I checked the box `[x]` and added a description for things I completed.

- [x] **Rented EC2 server** - I got a t3.nano
- [x] **Leased domain name** - I own the domain scripturebaseball.click
- [x] **Server accessible** from my domain: [https://scripturebaseball.click](https://scripturebaseball.click) - It now uses HTTPS for a secure connection

## 🚀 HTML deliverable

For this deliverable I did the following. I checked the box `[x]` and added a description for things I completed.

- [ ] I completed the prerequisites for this deliverable (Simon deployed, GitHub link, Git commits)
- [ ] **HTML pages** - I did not complete this part of the deliverable.
- [ ] **Proper HTML element usage** - I did not complete this part of the deliverable.
- [ ] **Links** - I did not complete this part of the deliverable.
- [ ] **Text** - I did not complete this part of the deliverable.
- [ ] **3rd party API placeholder** - I did not complete this part of the deliverable.
- [ ] **Images** - I did not complete this part of the deliverable.
- [ ] **Login placeholder** - I did not complete this part of the deliverable.
- [ ] **DB data placeholder** - I did not complete this part of the deliverable.
- [ ] **WebSocket placeholder** - I did not complete this part of the deliverable.

## 🚀 CSS deliverable

For this deliverable I did the following. I checked the box `[x]` and added a description for things I completed.

- [ ] I completed the prerequisites for this deliverable (Simon deployed, GitHub link, Git commits)
- [ ] **Visually appealing colors and layout. No overflowing elements.** - I did not complete this part of the deliverable.
- [ ] **Use of a CSS framework** - I did not complete this part of the deliverable.
- [ ] **All visual elements styled using CSS** - I did not complete this part of the deliverable.
- [ ] **Responsive to window resizing using flexbox and/or grid display** - I did not complete this part of the deliverable.
- [ ] **Use of a imported font** - I did not complete this part of the deliverable.
- [ ] **Use of different types of selectors including element, class, ID, and pseudo selectors** - I did not complete this part of the deliverable.

## 🚀 React part 1: Routing deliverable

For this deliverable I did the following. I checked the box `[x]` and added a description for things I completed.

- [ ] I completed the prerequisites for this deliverable (Simon deployed, GitHub link, Git commits)
- [ ] **Bundled using Vite** - I did not complete this part of the deliverable.
- [ ] **Components** - I did not complete this part of the deliverable.
- [ ] **Router** - I did not complete this part of the deliverable.

## 🚀 React part 2: Reactivity deliverable

For this deliverable I did the following. I checked the box `[x]` and added a description for things I completed.

- [ ] I completed the prerequisites for this deliverable (Simon deployed, GitHub link, Git commits)
- [ ] **All functionality implemented or mocked out** - I did not complete this part of the deliverable.
- [ ] **Hooks** - I did not complete this part of the deliverable.

## 🚀 Service deliverable

For this deliverable I did the following. I checked the box `[x]` and added a description for things I completed.

- [ ] I completed the prerequisites for this deliverable (Simon deployed, GitHub link, Git commits)
- [ ] **Node.js/Express HTTP service** - I did not complete this part of the deliverable.
- [ ] **Static middleware for frontend** - I did not complete this part of the deliverable.
- [ ] **Calls to third party endpoints** - I did not complete this part of the deliverable.
- [ ] **Backend service endpoints** - I did not complete this part of the deliverable.
- [ ] **Frontend calls service endpoints** - I did not complete this part of the deliverable.
- [ ] **Supports registration, login, logout, and restricted endpoint** - I did not complete this part of the deliverable.
- [ ] **Uses BCrypt to hash passwords** - I did not complete this part of the deliverable.

## 🚀 DB deliverable

For this deliverable I did the following. I checked the box `[x]` and added a description for things I completed.

- [ ] I completed the prerequisites for this deliverable (Simon deployed, GitHub link, Git commits)
- [ ] **Stores data in MongoDB** - I did not complete this part of the deliverable.
- [ ] **Stores credentials in MongoDB** - I did not complete this part of the deliverable.

## 🚀 WebSocket deliverable

For this deliverable I did the following. I checked the box `[x]` and added a description for things I completed.

- [ ] I completed the prerequisites for this deliverable (Simon deployed, GitHub link, Git commits)
- [ ] **Backend listens for WebSocket connection** - I did not complete this part of the deliverable.
- [ ] **Frontend makes WebSocket connection** - I did not complete this part of the deliverable.
- [ ] **Data sent over WebSocket connection** - I did not complete this part of the deliverable.
- [ ] **WebSocket data displayed** - I did not complete this part of the deliverable.
- [ ] **Application is fully functional** - I did not complete this part of the deliverable.
