import React from "react";
import './app.css';

import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
// import { game } from './game/game';
import { Account } from './account/account';

export default function App() {
    return (
        <BrowserRouter>
            {/* This is where all the header stuff goes */}
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
                    </menu>
                </nav>
            </header>

            <Routes>
                <Route path="/account" element={<Account />} />
                {/* <Route path="/challenges" element={<Challenges />} /> */}
            </Routes>

            </div>
        </BrowserRouter>
    );
}