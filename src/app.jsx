import React from "react";
import "./app.css";
import logo from './assets/logo-small.png';

import { BrowserRouter, Link, NavLink, Route, Routes } from "react-router-dom";
import { Account } from "./account/account";
import { Challenges } from "./challenges/challenges";
import { CreateGame } from "./create-game/create-game";
import { Game } from "./game/game";
import { Home } from "./home/home";
import { JoinGame } from "./join-game/join-game";
import { Play } from "./play/play";
import { Progress } from "./progress/progress";

const navLinkClass = ({ isActive }) =>
  [
    "rounded-lg px-3 py-2 text-sm font-medium transition",
    isActive
      ? "bg-green-100 text-green-950"
      : "text-stone-700 hover:bg-green-100 hover:text-green-950",
  ].join(" ");

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen flex-col">
        <header className="border-b border-stone-200 bg-white shadow-sm">
          <nav
            className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8"
            aria-label="Primary navigation"
          >
            <Link
                className="flex items-center gap-2 font-serif text-lg font-bold text-green-950"
                to="/"
                aria-label="Scripture Baseball home"
            >
                <img
                    src={logo}
                    alt=""
                    className="h-10 w-auto"
                />
                <span>Scripture Baseball</span>
            </Link>

            <menu className="flex flex-wrap gap-2">
              <li>
                <NavLink className={navLinkClass} to="/" end>
                  Home
                </NavLink>
              </li>
              <li>
                <NavLink className={navLinkClass} to="/play">
                  Play
                </NavLink>
              </li>
              <li>
                <NavLink className={navLinkClass} to="/challenges">
                  Challenges
                </NavLink>
              </li>
              <li>
                <NavLink className={navLinkClass} to="/create-game">
                  Create Game
                </NavLink>
              </li>
              <li>
                <NavLink className={navLinkClass} to="/join-game">
                  Join Game
                </NavLink>
              </li>
              <li>
                <NavLink className={navLinkClass} to="/progress">
                  Progress
                </NavLink>
              </li>
              <li>
                <NavLink className={navLinkClass} to="/account">
                  Account
                </NavLink>
              </li>
            </menu>
          </nav>
        </header>

        <main>
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/account" element={<Account />} />
                <Route path="/challenges" element={<Challenges />} />
                <Route path="/create-game" element={<CreateGame />} />
                <Route path="/game" element={<Game />} />
                <Route path="/join-game" element={<JoinGame />} />
                <Route path="/play" element={<Play />} />
                <Route path="/progress" element={<Progress />} />
            </Routes>
        </main>

        <footer className="border-t border-green-900/10 bg-green-950 px-6 py-4 text-center text-sm text-white">
            Scripture Baseball is an independent, unofficial hobby project made by Matthew.
        </footer>
      </div>
    </BrowserRouter>
  );
}
