import type { WeatherForecast } from "./types";

const CONDITIONS: WeatherForecast["condition"][] = [
  "sunny",
  "cloudy",
  "rainy",
  "sunny",
  "cloudy",
];

export function getWeatherForecast(
  startDate: string,
  days: number,
): WeatherForecast[] {
  const forecasts: WeatherForecast[] = [];

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const condition = CONDITIONS[i % CONDITIONS.length];

    forecasts.push({
      date: date.toISOString().split("T")[0],
      condition,
      tempHigh: condition === "rainy" ? 22 : 28 + (i % 3),
      tempLow: condition === "rainy" ? 16 : 18 + (i % 2),
      rainProbability: condition === "rainy" ? 80 : condition === "cloudy" ? 30 : 10,
    });
  }

  return forecasts;
}

export function weatherLabel(condition: WeatherForecast["condition"]): string {
  const labels = {
    sunny: "晴",
    cloudy: "多云",
    rainy: "雨",
    snowy: "雪",
  };
  return labels[condition];
}

export function weatherIcon(condition: WeatherForecast["condition"]): string {
  const icons = {
    sunny: "☀️",
    cloudy: "⛅",
    rainy: "🌧️",
    snowy: "❄️",
  };
  return icons[condition];
}
