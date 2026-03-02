import React from 'react';
import './Header.css';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle }) => {
  return (
    <div className="panel-header-bar">
      <div className="panel-header-bar__left">
        <h1 className="panel-header-bar__title">{title}</h1>
        {subtitle && <span className="panel-header-bar__subtitle">{subtitle}</span>}
      </div>
      <div className="panel-header-bar__right">
        <span className="panel-header-bar__status animate-beacon">●</span>
        <span className="panel-header-bar__label">ONLINE</span>
      </div>
    </div>
  );
};
