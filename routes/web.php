<?php

use Illuminate\Support\Facades\Route;

Route::inertia('/', 'Welcome')->name('home');
// Route::inertia('/rooms', [RoomController::class, 'index'])->name('rooms.index');
