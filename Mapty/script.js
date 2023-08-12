'use strict';

const form = document.querySelector('.form');
const containerWorkouts = document.querySelector('.workouts');
const inputType = document.querySelector('.form__input--type');
const inputDistance = document.querySelector('.form__input--distance');
const inputDuration = document.querySelector('.form__input--duration');
const inputCadence = document.querySelector('.form__input--cadence');
const inputElevation = document.querySelector('.form__input--elevation');
const reload = document.querySelector('.reload');
const showAll = document.querySelector('.show-all');
const sort = document.querySelector('.sort');

class Workout {
  date = new Date();
  id = (Date.now() + '').slice(-10);
  clicks = 0;

  constructor(coords, distance, duration) {
    this.coords = coords; // [lat, lng]
    this.distance = distance; // in km
    this.duration = duration; // in min
  }

  _setDescription() {
    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];

    this.description = `${this.type[0].toUpperCase()}${this.type.slice(1)} on ${
      months[this.date.getMonth()]
    } ${this.date.getDate()}`;
  }

  click() {
    this.clicks++;
  }
}

class Running extends Workout {
  type = 'running';
  constructor(coords, distance, duration, cadence) {
    super(coords, distance, duration);
    this.cadence = cadence;
    this.calcPace();
    this._setDescription();
  }

  calcPace() {
    this.pace = this.duration / this.distance;
    return this.pace;
  }
}

class Cycling extends Workout {
  type = 'cycling';

  constructor(coords, distance, duration, elevationGain) {
    super(coords, distance, duration);
    this.elevationGain = elevationGain;
    this.calcSpeed();
    this._setDescription();
  }

  calcSpeed() {
    this.speed = this.distance / (this.duration / 60);
    return this.speed;
  }
}

class App {
  #map;
  #mapZoomLevel = 13;
  #mapEvent;
  #workouts = [];
  #markers = [];
  #sort = false;

  constructor() {
    // Get user's position
    this._getPosition();

    // Get data from local storage
    this._getLocalStorage();

    // Attach event handlers
    form.addEventListener('submit', this._newWorkout.bind(this));
    inputType.addEventListener('change', this._toggleElevationField.bind(this));
    containerWorkouts.addEventListener('click', this._moveToPopup.bind(this));
    containerWorkouts.addEventListener('click', this._deleteForm.bind(this));
    containerWorkouts.addEventListener('click', this._editForm.bind(this));
    reload.addEventListener('click', this._reset.bind(this));
    showAll.addEventListener('click', this._showAllMarkers.bind(this));
    sort.addEventListener('click', this._sortWorkouts.bind(this));
  }

  _displayAlert(message) {
    const markup = `
      <div class="alert">
        ${message}
      </div>
    `;
    document.querySelector('body').insertAdjacentHTML('afterend', markup);

    // Remove the alert after 3 seconds
    setTimeout(() => {
      document.querySelector('.alert').remove();
    }, 5000);
  }

  _getPosition() {
    if (navigator.geolocation)
      navigator.geolocation.getCurrentPosition(
        this._loadMap.bind(this),
        function () {
          const warning = `
          <div class="overlay"></div>
          <div class="warning">
          <img src="logo.png" alt="Logo" class="logo"/>
          <p> Couldn't get your current position.
          </p>
          <i class="exclamation fa-solid fa-circle-exclamation fa-sm" style="color: #ff0000;"></i>
          </div>`;
          document.firstElementChild.lastElementChild.insertAdjacentHTML(
            'afterend',
            warning
          );
        }
      );
  }

  _loadMap(position) {
    const { latitude } = position.coords;
    const { longitude } = position.coords;

    const coords = [latitude, longitude];

    this.#map = L.map('map').setView(coords, this.#mapZoomLevel);

    L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.#map);

    // Handling clicks on map
    this.#map.on('click', this._showForm.bind(this));

    this.#workouts.forEach(workout => {
      this._renderWorkoutMarker(workout);
    });
  }

  _showForm(mapE) {
    this.#mapEvent = mapE;
    form.classList.remove('hidden');
    inputDistance.focus();
  }

  _hideForm() {
    // Empty inputs
    inputDistance.value =
      inputDuration.value =
      inputCadence.value =
      inputElevation.value =
        '';

    form.style.display = 'none';
    form.classList.add('hidden');
    setTimeout(() => (form.style.display = 'grid'), 1000);
  }

  _toggleElevationField() {
    inputElevation.closest('.form__row').classList.toggle('form__row--hidden');
    inputCadence.closest('.form__row').classList.toggle('form__row--hidden');
  }

  _newWorkout(e) {
    e.preventDefault();

    const validInputs = (...inputs) =>
      inputs.every(inp => Number.isFinite(inp));
    const allPositive = (...inputs) => inputs.every(inp => inp > 0);

    // Check if map event exists and has a latlng property
    if (!this.#mapEvent || !this.#mapEvent.latlng) {
      this._displayAlert('Please select a location on the map');
      return;
    }

    // Get data from form
    const type = inputType.value;
    const distance = +inputDistance.value;
    const duration = +inputDuration.value;
    const { lat, lng } = this.#mapEvent.latlng;
    let workout;

    // If workout running, create running object
    if (type === 'running') {
      const cadence = +inputCadence.value;

      // Check if data is valid
      if (
        !validInputs(distance, duration, cadence) ||
        !allPositive(distance, duration, cadence)
      ) {
        this._displayAlert('Inputs have to be positive numbers');
        return;
      }

      workout = new Running([lat, lng], distance, duration, cadence);
    }

    // If workout cycling, create cycling object
    if (type === 'cycling') {
      const elevation = +inputElevation.value;

      if (
        !validInputs(distance, duration, elevation) ||
        !allPositive(distance, duration, elevation)
      ) {
        this._displayAlert('Inputs have to be positive numbers');
        return;
      }

      workout = new Cycling([lat, lng], distance, duration, elevation);
    }

    // Add new object to workout array
    this.#workouts.push(workout);

    // Render workout on map as marker
    this._renderWorkoutMarker(workout);

    // Render workout on list
    this._renderWorkout(workout);

    // Hide form + clear input fields
    this._hideForm();

    // Set local storage to all workouts
    this._setLocalStorage();
  }

  _renderWorkoutMarker(workout) {
    const myMarkerIcon = L.icon({
      iconUrl: `${
        workout.type === 'running' ? 'green-marker.png' : 'orange-marker.png'
      }`,
      iconSize: [30, 50],
      popupAnchor: [0, -6],
    });
    const marker = L.marker(workout.coords, { icon: myMarkerIcon })
      .addTo(this.#map)
      .bindPopup(
        L.popup({
          maxWidth: 250,
          minWidth: 100,
          autoClose: false,
          closeOnClick: false,
          className: `${workout.type}-popup`,
        }).setContent(
          `${workout.type === 'running' ? '🏃‍♂️' : '🚴‍♀️'} ${workout.description}`
        )
      );

    marker.options.workoutId = workout.id;
    this.#markers.push(marker);
  }

  _renderWorkout(workout, sort = this.#sort) {
    if (!sort) {
      let html = `
      <li class="workout workout--${workout.type}" data-id="${workout.id}">
        <h2 class="workout__title">${workout.description}</h2>
        <div class="workout__details">
          <span class="workout__icon">${
            workout.type === 'running' ? '🏃‍♂️' : '🚴‍♀️'
          }</span>
          <span class="workout__value">${workout.distance}</span>
          <span class="workout__unit">km</span>
        </div>
        <div class="workout__details">
          <span class="workout__icon">⏱</span>
          <span class="workout__value">${workout.duration}</span>
          <span class="workout__unit">min</span>
        </div>
        <button class="delete"><i class="fa-solid fa-trash fa-xl" style="color: #${
          workout.type === 'running' ? '00c46a' : 'ffb545'
        };"></i></button>
        <button class="edit"><i class="fa-solid fa-pencil fa-xxl" style="color: #${
          workout.type === 'running' ? '00c46a' : 'ffb545'
        };"></i></button>
    `;

      if (workout.type === 'running' && workout.pace !== null) {
        html += `
        <div class="workout__details">
          <span class="workout__icon">⚡️</span>
          <span class="workout__value">${workout.pace.toFixed(1)}</span>
          <span class="workout__unit">min/km</span>
        </div>
        <div class="workout__details">
          <span class="workout__icon">🦶🏼</span>
          <span class="workout__value">${workout.cadence}</span>
          <span class="workout__unit">spm</span>
        </div>
      `;
      }

      if (workout.type === 'cycling' && workout.speed !== null) {
        html += `
        <div class="workout__details">
          <span class="workout__icon">⚡️</span>
          <span class="workout__value">${workout.speed.toFixed(1)}</span>
          <span class="workout__unit">km/h</span>
        </div>
        <div class="workout__details">
          <span class="workout__icon">⛰</span>
          <span class="workout__value">${workout.elevationGain}</span>
          <span class="workout__unit">m</span>
        </div>
      `;
      }

      containerWorkouts.insertAdjacentHTML('beforeend', html);
    } else {
      containerWorkouts.innerHTML = '';

      workout.forEach(work => {
        let html = `
        <li class="workout workout--${work.type}" data-id="${work.id}">
          <h2 class="workout__title">${work.description}</h2>
          <div class="workout__details">
            <span class="workout__icon">${
              work.type === 'running' ? '🏃‍♂️' : '🚴‍♀️'
            }</span>
            <span class="workout__value">${work.distance}</span>
            <span class="workout__unit">km</span>
          </div>
          <div class="workout__details">
            <span class="workout__icon">⏱</span>
            <span class="workout__value">${work.duration}</span>
            <span class="workout__unit">min</span>
          </div>
          <button class="delete"><i class="fa-solid fa-trash fa-xl" style="color: #${
            work.type === 'running' ? '00c46a' : 'ffb545'
          };"></i></button>
          <button class="edit"><i class="fa-solid fa-pencil fa-xxl" style="color: #${
            work.type === 'running' ? '00c46a' : 'ffb545'
          };"></i></button>
      `;

        if (work.type === 'running' && work.pace !== null) {
          html += `
          <div class="workout__details">
            <span class="workout__icon">⚡️</span>
            <span class="workout__value">${work.pace.toFixed(1)}</span>
            <span class="workout__unit">min/km</span>
          </div>
          <div class="workout__details">
            <span class="workout__icon">🦶🏼</span>
            <span class="workout__value">${work.cadence}</span>
            <span class="workout__unit">spm</span>
          </div>
        `;
        }

        if (work.type === 'cycling' && work.speed !== null) {
          html += `
          <div class="workout__details">
            <span class="workout__icon">⚡️</span>
            <span class="workout__value">${work.speed.toFixed(1)}</span>
            <span class="workout__unit">km/h</span>
          </div>
          <div class="workout__details">
            <span class="workout__icon">⛰</span>
            <span class="workout__value">${work.elevationGain}</span>
            <span class="workout__unit">m</span>
          </div>
        `;
        }

        containerWorkouts.insertAdjacentHTML('beforeend', html);

        return;
      });
    }
  }

  _moveToPopup(e) {
    const workoutEl = e.target.closest('.workout');

    if (!workoutEl) return;

    const workout = this.#workouts.find(
      work => work.id === workoutEl.dataset.id
    );

    this.#map.setView(workout.coords, this.#mapZoomLevel, {
      animate: true,
      pan: {
        duration: 1,
      },
    });
  }

  _deleteForm(e) {
    e.stopPropagation();
    const deleteButton = e.target.closest('.delete');

    if (!deleteButton) return;

    const workoutContainer = deleteButton.closest('.workout');

    if (workoutContainer) {
      const workoutId = workoutContainer.dataset.id;

      // Remove the workout from the #workouts array
      const deletedWorkoutIndex = this.#workouts.findIndex(
        workout => workout.id === workoutId
      );
      if (deletedWorkoutIndex > -1) {
        this.#workouts.splice(deletedWorkoutIndex, 1);
      }

      // Remove the workout container from the DOM
      workoutContainer.remove();

      // Remove the corresponding marker from the map
      const deletedMarkerIndex = this.#markers.findIndex(
        marker => marker.options.workoutId === workoutId
      );
      if (deletedMarkerIndex > -1) {
        const deletedMarker = this.#markers.splice(deletedMarkerIndex, 1)[0];
        this.#map.removeLayer(deletedMarker);
      }

      // Set local storage to updated workouts
      this._setLocalStorage();
    }
  }

  _editForm(e) {
    e.stopPropagation();
    const editButton = e.target.closest('.edit');

    if (!editButton) return;

    const workoutEl = editButton.closest('.workout');

    if (workoutEl) {
      const workoutId = workoutEl.dataset.id;

      const editedWorkout = this.#workouts.find(work => work.id === workoutId);

      if (editedWorkout) {
        form.classList.remove('hidden');
        // Populate the form fields with the current workout data
        inputType.value = editedWorkout.type;
        inputDistance.value = editedWorkout.distance;
        inputDuration.value = editedWorkout.duration;

        if (editedWorkout.type === 'running') {
          inputCadence.value = editedWorkout.cadence;
          inputElevation.value = '';
          inputCadence.focus();
        } else if (editedWorkout.type === 'cycling') {
          inputCadence.value = '';
          inputElevation.value = editedWorkout.elevationGain;
          inputElevation.focus();
        }

        const deletedWorkoutIndex = this.#workouts.findIndex(
          workout => workout.id === workoutId
        );
        if (deletedWorkoutIndex > -1) {
          this.#workouts.splice(deletedWorkoutIndex, 1);
        }

        const deletedMarkerIndex = this.#markers.findIndex(
          marker => marker.options.workoutId === workoutId
        );
        if (deletedMarkerIndex > -1) {
          const deletedMarker = this.#markers.splice(deletedMarkerIndex, 1)[0];
          this.#map.removeLayer(deletedMarker);
        }

        workoutEl.remove();

        this._setLocalStorage();
      }
    }
  }

  _setLocalStorage() {
    localStorage.setItem('workouts', JSON.stringify(this.#workouts));
  }

  _getLocalStorage() {
    const data = JSON.parse(localStorage.getItem('workouts'));

    if (!data) return;

    this.#workouts = data;

    this.#workouts.forEach(work => {
      this._renderWorkout(work);
    });
  }

  _reset() {
    localStorage.removeItem('workouts');
    location.reload();
  }

  _showAllMarkers() {
    if (this.#workouts.length <= 0) return;

    const bounds = new L.LatLngBounds();

    this.#workouts.forEach(work => {
      const coords = work.coords;
      bounds.extend(coords);
    });

    this.#map.fitBounds(bounds);
  }

  _sortWorkouts() {
    if (this.#sort) {
      this.#workouts.sort((a, b) => a.distance - b.distance);
    } else {
      this.#workouts.sort((a, b) => a.id - b.id);
    }

    this.#sort = !this.#sort;
    this._renderWorkout(this.#workouts, true);
   
    return;
  }
}

const app = new App();
