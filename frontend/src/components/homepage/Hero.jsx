import Footer from "./Footer";

import { Link } from 'react-router-dom';

const Hero = () => {

  return (
    <>
      <section className="hero min-h-screen bg-base-200 mb-auto">
        <div className="hero-content flex-col lg:flex-row-reverse">
          <img
            src="/Online-communication.png"
            className="max-w-m"
            alt="StudyHomies"
            width={500}
            height={500}
          />
          <div>
            <h1 className="text-5xl font-bold">Find Your Perfect Study Partners Online!</h1>
            <h4 className="text-2xl py-4">
            Connect with Like-Minded Students
            and Excel Together.
            </h4>
            <p className="py-6"> 
            Whether you&#39;re tackling a challenging
            course, preparing for exams, or seeking 
            to enhance your learning experience,
            StudyHomies is your go-to platform to
            find dedicated study partners who share
            your academic journey and aspirations.
            </p>
            <Link to="/findstudybudy" className="btn btn-primary">
              Find Study Homies
            </Link>
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
};

export default Hero;
