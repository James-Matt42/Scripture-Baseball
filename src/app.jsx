import React from "react";
import './app.css';

import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom';
import { Account } from './account/account';
import { Challenges } from './challenges/challenges';
import { CreateGame } from "./create-game/create-game";
import { Game } from './game/game';
import { Home } from './home/home';
import { JoinGame } from './join-game/join-game';
import { Play } from './play/play';
import { Progress } from './progress/progress';

export default function App() {
    return (
        <BrowserRouter>
            <div>
            <header>
                <nav aria-label="Primary navigation">
                    <div>
                        <Link to="/" aria-label="Scripture Baseball home">Scripture Baseball</Link>
                    </div>
                    <menu>
                        <li className="nav-item">
                        <NavLink className="nav-link" to="/" end>
                            Home
                        </NavLink>
                        </li>
                        <li className="nav-item">
                        <NavLink className="nav-link" to="/play">
                            Play
                        </NavLink>
                        </li>
                        <li className="nav-item">
                        <NavLink className="nav-link" to="/challenges">
                            Challenges
                        </NavLink>
                        </li>
                        <li className="nav-item">
                        <NavLink className="nav-link" to="/create-game">
                            Create Game
                        </NavLink>
                        </li>
                        <li className="nav-item">
                        <NavLink className="nav-link" to="/join-game">
                            Join Game
                        </NavLink>
                        </li>
                        <li className="nav-item">
                        <NavLink className="nav-link" to="/progress">
                            Progress
                        </NavLink>
                        </li>
                        <li className="nav-item">
                        <NavLink className="nav-link" to="/account">
                            Account
                        </NavLink>
                        </li>
                    </menu>
                </nav>
            </header>

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

            </div>
        </BrowserRouter>
    );
}
