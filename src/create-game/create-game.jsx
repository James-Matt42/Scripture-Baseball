import React from "react";
import { Link, useNavigate } from "react-router-dom";
import './create-game.css';
import { navigateWithGetForm } from '../routing';

export function CreateGame() {
    const navigate = useNavigate();

    function handleCreateGame(event) {
      navigateWithGetForm(event, navigate, "/game");
    }

    return (
  <main className="sb-main">
    <header className="sb-header">
      <h1>Create a Private Game</h1>

      <p>
        Choose a challenge and a few game settings, then invite your
        friends or family to join.
      </p>
    </header>

    <form className="sb-form-card" onSubmit={handleCreateGame}>
      <section className="sb-form-group" aria-labelledby="challenge-heading">
        <h2 id="challenge-heading">Choose a challenge</h2>

        <label className="sb-form-label" htmlFor="challenge">Challenge</label>
        <select className="sb-form-input" id="challenge" name="challenge">
          <option value="book-of-mormon">Book of Mormon</option>
          <option value="doctrinal-mastery">Doctrinal Mastery</option>
          <option value="four-gospels">Four Gospels</option>
          <option value="new-testament">New Testament</option>
          <option value="faith">Faith</option>
          <option value="conference">Frequently Cited in Conference</option>
          <option value="obscure">Obscure Scriptures</option>
        </select>

        <p>
          <Link to="/challenges">Browse all challenges</Link>
        </p>
      </section>

      <section className="sb-form-group" aria-labelledby="format-heading">
        <h2 id="format-heading">Game format</h2>

        <fieldset className="sb-option-group">
          <legend>How will this game be played?</legend>

          <div>
            <input
              type="radio"
              id="format-live"
              name="format"
              value="live"
              defaultChecked
            />
            <label className="sb-form-label" htmlFor="format-live">Live private match</label>
            <p>
              Everyone plays together in the same room.
            </p>
          </div>

          <div>
            <input
              type="radio"
              id="format-async"
              name="format"
              value="async"
            />
            <label className="sb-form-label" htmlFor="format-async">Friend challenge</label>
            <p>
              Send the same set of pitches to friends to complete later.
            </p>
          </div>
        </fieldset>
      </section>

      <section className="sb-form-group" aria-labelledby="difficulty-heading">
        <h2 id="difficulty-heading">Difficulty</h2>

        <fieldset className="sb-option-group">
          <legend>Choose a difficulty level</legend>

          <div>
            <input
              type="radio"
              id="difficulty-beginner"
              name="difficulty"
              value="beginner"
            />
            <label className="sb-form-label" htmlFor="difficulty-beginner">Beginner</label>
            <p>
              More answer choices and stronger hints.
            </p>
          </div>

          <div>
            <input
              type="radio"
              id="difficulty-standard"
              name="difficulty"
              value="standard"
              defaultChecked
            />
            <label className="sb-form-label" htmlFor="difficulty-standard">Standard</label>
            <p>
              Identify the book first, then the chapter.
            </p>
          </div>

          <div>
            <input
              type="radio"
              id="difficulty-expert"
              name="difficulty"
              value="expert"
            />
            <label className="sb-form-label" htmlFor="difficulty-expert">Expert</label>
            <p>
              Fewer cues and more difficult passages.
            </p>
          </div>
        </fieldset>
      </section>

      <section className="sb-form-group" aria-labelledby="length-heading">
        <h2 id="length-heading">Game length</h2>

        <fieldset className="sb-option-group">
          <legend>Number of pitches</legend>

          <div>
            <input
              type="radio"
              id="length-5"
              name="length"
              value="5"
            />
            <label className="sb-form-label" htmlFor="length-5">5 pitches</label>
          </div>

          <div>
            <input
              type="radio"
              id="length-10"
              name="length"
              value="10"
              defaultChecked
            />
            <label className="sb-form-label" htmlFor="length-10">10 pitches</label>
          </div>

          <div>
            <input
              type="radio"
              id="length-20"
              name="length"
              value="20"
            />
            <label className="sb-form-label" htmlFor="length-20">20 pitches</label>
          </div>
        </fieldset>
      </section>

      <section className="sb-form-group" aria-labelledby="answer-settings-heading">
        <h2 id="answer-settings-heading">Answer settings</h2>

        <p>
          Players normally identify the book first and then the chapter.
        </p>

        <div>
          <input
            type="checkbox"
            id="exact-verse"
            name="exact-verse"
            value="yes"
          />
          <label className="sb-form-label" htmlFor="exact-verse">
            Also require the exact verse
          </label>
        </div>

        <p>
          Exact verse identification adds an additional stage and is
          intended for players who want a harder challenge.
        </p>
      </section>

      <section className="sb-form-group" aria-labelledby="room-settings-heading">
        <h2 id="room-settings-heading">Room settings</h2>

        <div>
          <label className="sb-form-label" htmlFor="game-name">Game name</label>
          <input
            id="game-name"
            name="game-name"
            type="text"
            placeholder="Saturday Scripture Game"
          />
        </div>

        <div>
          <label className="sb-form-label" htmlFor="max-players">Maximum players</label>
          <select className="sb-form-input" id="max-players" name="max-players" defaultValue="4">
            <option value="2">2 players</option>
            <option value="4">4 players</option>
            <option value="8">8 players</option>
            <option value="12">12 players</option>
          </select>
        </div>
      </section>

      <button className="sb-button-primary" type="submit">Create Game</button>
    </form>

    <section className="sb-form-group" aria-labelledby="after-creation-heading">
      <h2 id="after-creation-heading">After you create the game</h2>

      <p>
        A private room will be created with a short join code, invitation
        link, and QR code that you can share with other players.
      </p>

      <p>
        Invited players will be able to sign in or continue as a guest
        without losing their place in the room.
      </p>
    </section>
  </main>
    );
}