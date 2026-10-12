<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
})->name('home');

Route::get('/tierlist', function () {
    return view('welcome');
})->name('tierlist');

Route::get('/leaderboard', function () {
    return view('welcome');
})->name('leaderboard');
