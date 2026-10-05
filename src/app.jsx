import React from "react";
import './app.css';

import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import { Account } from './account/account';
import { Challenges } from './challenges/challenges';
import { CreateGame } from "./create-game/create-game";
import { Game } from './game/game';
import { JoinGame } from './join-game/join-game';
import { Play } from './play/play';
import { Progress } from './progress/progress';

export default function App() {
    return (
        <BrowserRouter>
            <div>
            <header>
                <nav>
                    <div>
                        Scripture Baseball
                    </div>
                    <menu>
                        <li className="nav-item">
                        <NavLink className="nav-link" to="account">
                            Account
                        </NavLink>
                        </li>
                        <li className="nav-item">
                        <NavLink className="nav-link" to="challenges">
                            Challenges
                        </NavLink>
                        </li>
                        <li className="nav-item">
                        <NavLink className="nav-link" to="create-game">
                            Create Game
                        </NavLink>
                        </li>
                        <li className="nav-item">
                        <NavLink className="nav-link" to="join-game">
                            Join Game
                        </NavLink>
                        </li>
                        <li className="nav-item">
                        <NavLink className="nav-link" to="play">
                            Play
                        </NavLink>
                        </li>
                        <li className="nav-item">
                        <NavLink className="nav-link" to="progress">
                            Progress
                        </NavLink>
                        </li>
                    </menu>
                </nav>
            </header>

            <Routes>
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